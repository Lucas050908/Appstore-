// Lokal AI – JNI-bro til llama.cpp
// Hele samtalen sendes med hver gang; KV-cachen genbruges for det fælles prefix,
// så kun nye tokens skal beregnes.

#include <jni.h>
#include <unistd.h>
#include <atomic>
#include <mutex>
#include <string>
#include <vector>
#include <algorithm>

#ifdef __ANDROID__
#include <android/log.h>
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, "lokalai", __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, "lokalai", __VA_ARGS__)
#else
#include <cstdio>
#define LOGI(...) (fprintf(stderr, __VA_ARGS__), fputc('\n', stderr))
#define LOGE(...) (fprintf(stderr, __VA_ARGS__), fputc('\n', stderr))
#endif

#include "llama.h"
#include "common.h"
#include "chat.h"
#include "sampling.h"

static constexpr int BATCH = 512;

static std::mutex                g_mtx;
static llama_model             * g_model   = nullptr;
static llama_context           * g_ctx     = nullptr;
static common_chat_templates_ptr g_tmpls;
static std::vector<llama_token>  g_cache;          // tokens der ligger i KV-cachen (seq 0)
static std::atomic<bool>         g_stop{false};
static std::string               g_last_error;

#ifdef __ANDROID__
static void log_cb(ggml_log_level level, const char * text, void *) {
    int prio = level >= GGML_LOG_LEVEL_ERROR ? ANDROID_LOG_ERROR :
               level >= GGML_LOG_LEVEL_WARN  ? ANDROID_LOG_WARN  : ANDROID_LOG_DEBUG;
    __android_log_print(prio, "llama", "%s", text);
}
#endif

static void free_all() {
    g_tmpls.reset();
    if (g_ctx)   { llama_free(g_ctx);         g_ctx = nullptr; }
    if (g_model) { llama_model_free(g_model); g_model = nullptr; }
    g_cache.clear();
}

static std::string jstr(JNIEnv * env, jstring s) {
    if (!s) return {};
    // Hent som UTF-16 og konvertér selv, så emojis o.l. ikke ødelægges af "modified UTF-8"
    const jsize len = env->GetStringLength(s);
    const jchar * c = env->GetStringChars(s, nullptr);
    std::string out; out.reserve(len);
    for (jsize i = 0; i < len; i++) {
        uint32_t cp = c[i];
        if (cp >= 0xD800 && cp <= 0xDBFF && i + 1 < len && c[i+1] >= 0xDC00 && c[i+1] <= 0xDFFF) {
            cp = 0x10000 + ((cp - 0xD800) << 10) + (c[i+1] - 0xDC00); i++;
        }
        if (cp < 0x80) out += (char) cp;
        else if (cp < 0x800) { out += (char)(0xC0 | (cp >> 6)); out += (char)(0x80 | (cp & 0x3F)); }
        else if (cp < 0x10000) { out += (char)(0xE0 | (cp >> 12)); out += (char)(0x80 | ((cp >> 6) & 0x3F)); out += (char)(0x80 | (cp & 0x3F)); }
        else { out += (char)(0xF0 | (cp >> 18)); out += (char)(0x80 | ((cp >> 12) & 0x3F)); out += (char)(0x80 | ((cp >> 6) & 0x3F)); out += (char)(0x80 | (cp & 0x3F)); }
    }
    env->ReleaseStringChars(s, c);
    return out;
}

// Antal bytes i starten af s der udgør hele UTF-8-tegn
static size_t utf8_complete_prefix(const std::string & s) {
    size_t i = 0, n = s.size();
    while (i < n) {
        unsigned char b = s[i];
        size_t len = b < 0x80 ? 1 : (b >> 5) == 0x6 ? 2 : (b >> 4) == 0xE ? 3 : (b >> 3) == 0x1E ? 4 : 1;
        if (i + len > n) break;
        i += len;
    }
    return i;
}

static std::string render(const std::vector<common_chat_msg> & msgs, bool jinja) {
    common_chat_templates_inputs in;
    in.messages = msgs;
    in.add_generation_prompt = true;
    in.use_jinja = jinja;
    in.enable_thinking = false;
    return common_chat_templates_apply(g_tmpls.get(), in).prompt.str();
}

static std::vector<llama_token> tokenize_prompt(const std::vector<common_chat_msg> & msgs) {
    std::string text;
    try { text = render(msgs, true); }
    catch (const std::exception & e) {
        LOGE("jinja fejlede (%s) – prøver simpel skabelon", e.what());
        text = render(msgs, false);
    }
    auto toks = common_tokenize(g_ctx, text, true, true);
    const llama_token bos = llama_vocab_bos(llama_model_get_vocab(g_model));
    if (toks.size() >= 2 && toks[0] == bos && toks[1] == bos) toks.erase(toks.begin());
    return toks;
}

static int decode_range(const std::vector<llama_token> & toks, size_t from, common_batch & batch) {
    for (size_t i = from; i < toks.size(); i += BATCH) {
        if (g_stop) return 1;
        const size_t n = std::min((size_t) BATCH, toks.size() - i);
        batch.clear();
        for (size_t j = 0; j < n; j++) {
            batch.add(toks[i + j], (llama_pos)(i + j), 0, i + j == toks.size() - 1);
        }
        if (llama_process(g_ctx, LLAMA_PROCESS_TYPE_DECODE, batch.get()) != 0) return 2;
        g_cache.insert(g_cache.end(), toks.begin() + i, toks.begin() + i + n);
    }
    return 0;
}

extern "C" {

JNIEXPORT void JNICALL
Java_dk_lucas_lokalai_Llama_nativeInit(JNIEnv * env, jclass, jstring libDir) {
#ifdef __ANDROID__
    llama_log_set(log_cb, nullptr);
#endif
    const std::string dir = jstr(env, libDir);
#ifdef GGML_BACKEND_DL
    ggml_backend_load_all_from_path(dir.c_str());
#else
    (void) dir;
#endif
    llama_backend_init();
}

JNIEXPORT jstring JNICALL
Java_dk_lucas_lokalai_Llama_nativeLoad(JNIEnv * env, jclass, jstring jpath, jint nCtx, jint nThreads) {
    std::lock_guard<std::mutex> lk(g_mtx);
    free_all();
    const std::string path = jstr(env, jpath);

    auto mp = llama_model_default_params();
    g_model = llama_model_load_from_file(path.c_str(), mp);
    if (!g_model) return env->NewStringUTF("Kunne ikke indlæse modellen (er filen en gyldig GGUF?)");

    int threads = nThreads > 0 ? nThreads
                : std::max(2, std::min(4, (int) sysconf(_SC_NPROCESSORS_ONLN) - 2));
    int ctx_train = llama_model_n_ctx_train(g_model);
    int n_ctx = std::min((int) nCtx, ctx_train > 0 ? ctx_train : (int) nCtx);

    auto cp = llama_context_default_params();
    cp.n_ctx = n_ctx;
    cp.n_batch = BATCH;
    cp.n_ubatch = BATCH;
    cp.n_threads = threads;
    cp.n_threads_batch = threads;
    g_ctx = llama_init_from_model(g_model, cp);
    if (!g_ctx) { free_all(); return env->NewStringUTF("Ikke nok hukommelse til modellen – prøv en mindre model eller kortere kontekst"); }

    try { g_tmpls = common_chat_templates_init(g_model, ""); }
    catch (const std::exception & e) {
        LOGE("skabelon: %s", e.what());
        g_tmpls = common_chat_templates_init(g_model, "chatml");
    }
    LOGI("Model indlæst: ctx=%d threads=%d", n_ctx, threads);
    return nullptr;
}

JNIEXPORT jstring JNICALL
Java_dk_lucas_lokalai_Llama_nativeInfo(JNIEnv * env, jclass) {
    std::lock_guard<std::mutex> lk(g_mtx);
    if (!g_model) return env->NewStringUTF("");
    char desc[256];
    llama_model_desc(g_model, desc, sizeof(desc));
    std::string s = std::string(desc) + " · ctx " + std::to_string(llama_n_ctx(g_ctx));
    return env->NewStringUTF(s.c_str());
}

JNIEXPORT void JNICALL
Java_dk_lucas_lokalai_Llama_nativeStop(JNIEnv *, jclass) { g_stop = true; }

JNIEXPORT void JNICALL
Java_dk_lucas_lokalai_Llama_nativeUnload(JNIEnv *, jclass) {
    g_stop = true;
    std::lock_guard<std::mutex> lk(g_mtx);
    free_all();
}

// Returnerer null ved succes, ellers en fejltekst.
JNIEXPORT jstring JNICALL
Java_dk_lucas_lokalai_Llama_nativeChat(JNIEnv * env, jclass, jobjectArray jroles, jobjectArray jtexts,
                                       jfloat temp, jint maxTokens, jobject cb) {
    std::lock_guard<std::mutex> lk(g_mtx);
    g_stop = false;
    if (!g_model || !g_ctx) return env->NewStringUTF("Ingen model indlæst");

    jclass cbCls = env->GetObjectClass(cb);
    jmethodID onToken = env->GetMethodID(cbCls, "onToken", "([B)V");
    if (!onToken) return env->NewStringUTF("intern fejl: callback");

    std::vector<common_chat_msg> msgs;
    const jsize n = env->GetArrayLength(jroles);
    for (jsize i = 0; i < n; i++) {
        auto r = (jstring) env->GetObjectArrayElement(jroles, i);
        auto t = (jstring) env->GetObjectArrayElement(jtexts, i);
        common_chat_msg m; m.role = jstr(env, r); m.content = jstr(env, t);
        env->DeleteLocalRef(r); env->DeleteLocalRef(t);
        msgs.push_back(std::move(m));
    }

    const int n_ctx = (int) llama_n_ctx(g_ctx);
    const int reserve = std::max(64, std::min((int) maxTokens, n_ctx / 2));

    std::vector<llama_token> toks;
    try {
        toks = tokenize_prompt(msgs);
        // Fjern ældste beskeder (ikke system, ikke sidste) indtil prompten kan være der
        while ((int) toks.size() > n_ctx - reserve) {
            size_t first = (!msgs.empty() && msgs[0].role == "system") ? 1 : 0;
            if (msgs.size() <= first + 1) break;
            msgs.erase(msgs.begin() + first);
            toks = tokenize_prompt(msgs);
        }
    } catch (const std::exception & e) {
        return env->NewStringUTF((std::string("Skabelonfejl: ") + e.what()).c_str());
    }
    if ((int) toks.size() > n_ctx - 16) return env->NewStringUTF("Beskeden er for lang til modellens kontekst");

    // Genbrug KV-cache for fælles prefix (behold mindst ét token at beregne)
    size_t keep = 0;
    while (keep < g_cache.size() && keep < toks.size() - 1 && g_cache[keep] == toks[keep]) keep++;
    llama_memory_t mem = llama_get_memory(g_ctx);
    if (!llama_memory_seq_rm(mem, 0, (llama_pos) keep, -1)) {
        llama_memory_clear(mem, false);
        keep = 0;
    }
    g_cache.resize(keep);

    common_batch batch(g_ctx);
    int rc = decode_range(toks, keep, batch);
    if (rc == 1) return nullptr;              // stoppet under indlæsning
    if (rc != 0) { llama_memory_clear(mem, false); g_cache.clear(); return env->NewStringUTF("Beregningsfejl (decode)"); }

    common_params_sampling sp;
    sp.temp = temp;
    sp.top_k = 40;
    sp.top_p = 0.95f;
    sp.min_p = 0.05f;
    sp.penalty_repeat = 1.05f;
    common_sampler * smpl = common_sampler_init(g_model, sp);
    if (!smpl) return env->NewStringUTF("Kunne ikke oprette sampler");

    const llama_vocab * vocab = llama_model_get_vocab(g_model);
    std::string pending;
    int produced = 0;
    std::string err;

    auto emit = [&](bool flush) {
        size_t k = flush ? pending.size() : utf8_complete_prefix(pending);
        if (k == 0) return;
        jbyteArray arr = env->NewByteArray((jsize) k);
        env->SetByteArrayRegion(arr, 0, (jsize) k, (const jbyte *) pending.data());
        env->CallVoidMethod(cb, onToken, arr);
        env->DeleteLocalRef(arr);
        pending.erase(0, k);
    };

    while (!g_stop && produced < maxTokens) {
        if ((int) g_cache.size() >= n_ctx - 1) break;   // konteksten er fuld
        llama_token id = common_sampler_sample(smpl, g_ctx, -1);
        common_sampler_accept(smpl, id, true);
        if (llama_vocab_is_eog(vocab, id)) break;

        pending += common_token_to_piece(g_ctx, id, false);
        emit(false);
        if (env->ExceptionCheck()) { env->ExceptionClear(); break; }

        batch.clear();
        batch.add(id, (llama_pos) g_cache.size(), 0, true);
        if (llama_process(g_ctx, LLAMA_PROCESS_TYPE_DECODE, batch.get()) != 0) { err = "Beregningsfejl under svar"; break; }
        g_cache.push_back(id);
        produced++;
    }
    emit(true);
    common_sampler_free(smpl);
    if (!err.empty()) { llama_memory_clear(mem, false); g_cache.clear(); return env->NewStringUTF(err.c_str()); }
    return nullptr;
}

} // extern "C"
