package dk.lucas.lokalai;

/** Tynd Java-indpakning af llama.cpp (se cpp/lokalai.cpp). */
public final class Llama {
    private Llama() {}

    public interface TokenCallback { void onToken(byte[] utf8); }

    /** Indlæser backends og initialiserer llama.cpp. Kaldes én gang. */
    public static native void nativeInit(String nativeLibDir);
    /** @return null ved succes, ellers fejltekst */
    public static native String nativeLoad(String path, int nCtx, int nThreads);
    public static native String nativeInfo();
    /** @return null ved succes, ellers fejltekst */
    public static native String nativeChat(String[] roles, String[] texts, float temp, int maxTokens, TokenCallback cb);
    public static native void nativeStop();
    public static native void nativeUnload();
}
