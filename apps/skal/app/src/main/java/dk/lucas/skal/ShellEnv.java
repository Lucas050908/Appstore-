package dk.lucas.skal;

import android.content.Context;
import android.os.Build;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** Opretter $HOME og $PREFIX og bygger miljøet til shell-processerne. */
final class ShellEnv {
    static final String SHELL = "/system/bin/sh";

    final File home, prefix, bin, etc, tmp;
    final String version;

    ShellEnv(Context c) {
        File files = c.getFilesDir();
        home = new File(files, "home");
        prefix = new File(files, "usr");
        bin = new File(prefix, "bin");
        etc = new File(prefix, "etc");
        tmp = new File(prefix, "tmp");
        String v = "?";
        try { v = c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName; } catch (Exception ignored) { }
        version = v;
    }

    void setup() {
        home.mkdirs(); bin.mkdirs(); etc.mkdirs(); tmp.mkdirs();
        new File(home, "bin").mkdirs();
        write(new File(etc, "skalrc"), RC, false);
        write(new File(etc, "motd"), MOTD, false);
        // Brugerens egen rc oprettes kun én gang, så ændringer bevares
        File userRc = new File(home, ".shrc");
        if (!userRc.exists()) write(userRc, USER_RC, false);
        script("skal-info", INFO);
        script("ll", "#!/system/bin/sh\nexec ls -lAh \"$@\"\n");
    }

    private void script(String name, String body) {
        File f = new File(bin, name);
        write(f, body, true);
    }

    private static void write(File f, String s, boolean exec) {
        try (FileOutputStream o = new FileOutputStream(f)) {
            o.write(s.getBytes(StandardCharsets.UTF_8));
        } catch (Exception ignored) { }
        if (exec) f.setExecutable(true, false);
    }

    String[] env(int cols) {
        Map<String, String> m = new TreeMap<>(System.getenv());
        m.put("HOME", home.getAbsolutePath());
        m.put("PREFIX", prefix.getAbsolutePath());
        m.put("TMPDIR", tmp.getAbsolutePath());
        m.put("PATH", home + "/bin:" + bin + ":/product/bin:/system/bin:/system/xbin:/vendor/bin");
        m.put("SHELL", SHELL);
        m.put("TERM", "xterm-256color");
        m.put("COLORTERM", "truecolor");
        m.put("LANG", "en_US.UTF-8");
        m.put("ENV", new File(etc, "skalrc").getAbsolutePath());
        m.put("SKAL_VERSION", version);
        m.put("HOSTNAME", "skal");
        m.put("USER", "skal");
        m.put("PWD", home.getAbsolutePath());
        List<String> out = new ArrayList<>();
        for (Map.Entry<String, String> e : m.entrySet()) out.add(e.getKey() + "=" + e.getValue());
        return out.toArray(new String[0]);
    }

    private static final String RC =
        "# Skal – indlæses af alle interaktive shells. Ret i stedet ~/.shrc\n" +
        "[ -r /system/etc/mkshrc ] && . /system/etc/mkshrc\n" +
        "alias ls='ls --color=auto' 2>/dev/null\n" +
        "alias la='ls -A' l='ls -CF' ..='cd ..' cls=clear\n" +
        "alias grep='grep --color=auto' 2>/dev/null\n" +
        "HISTFILE=\"$HOME/.sh_history\"; HISTSIZE=2000\n" +
        // mksh: \\1 afgrænser usynlige sekvenser i PS1
        "PS1=$'\\1\\r\\1\\e[1;32m\\1${PWD/#\"$HOME\"/\\\\~}\\1\\e[0m\\1 $ '\n" +
        "if [ -z \"$SKAL_MOTD\" ] && [ ! -f \"$HOME/.hushlogin\" ]; then cat \"$PREFIX/etc/motd\"; fi\n" +
        "export SKAL_MOTD=1\n" +
        "[ -r \"$HOME/.shrc\" ] && . \"$HOME/.shrc\"\n";

    private static final String USER_RC =
        "# Din egen opsætning – indlæses hver gang en ny session starter.\n" +
        "# Eksempler:\n" +
        "# alias gs='git status'\n" +
        "# export EDITOR=vi\n";

    private static final String MOTD =
        "\n\033[1;32m  >_ Skal\033[0m  – terminal til Android\n\n" +
        "  \033[2mDu kører Androids indbyggede shell (mksh + toybox).\033[0m\n" +
        "  \033[1mskal-info\033[0m   vis system, mapper og tips\n" +
        "  \033[1m~/bin\033[0m       læg dine egne scripts/programmer her\n" +
        "  \033[1m~/.shrc\033[0m     dine aliaser og variabler\n" +
        "  \033[2mSkjul denne besked: touch ~/.hushlogin\033[0m\n\n";

    private static final String INFO =
        "#!/system/bin/sh\n" +
        "b='\\033[1m'; d='\\033[2m'; n='\\033[0m'\n" +
        "printf \"${b}Skal${n} $SKAL_VERSION\\n\\n\"\n" +
        "printf \"Enhed:     %s %s\\n\" \"$(getprop ro.product.manufacturer)\" \"$(getprop ro.product.model)\"\n" +
        "printf \"Android:   %s (API %s)\\n\" \"$(getprop ro.build.version.release)\" \"$(getprop ro.build.version.sdk)\"\n" +
        "printf \"CPU:       %s\\n\" \"$(uname -m)\"\n" +
        "printf \"Bruger:    %s\\n\" \"$(id -un 2>/dev/null || id -u)\"\n" +
        "printf \"HOME:      %s\\n\" \"$HOME\"\n" +
        "printf \"PREFIX:    %s\\n\" \"$PREFIX\"\n" +
        "[ -d \"$HOME/storage\" ] && printf \"Lager:     ~/storage → /sdcard\\n\" || printf \"Lager:     ${d}ikke givet (menu → Adgang til lager)${n}\\n\"\n" +
        "printf \"\\n${b}Tips${n}\\n\"\n" +
        "printf \"  Knib for at zoome. Langt tryk markerer tekst.\\n\"\n" +
        "printf \"  Lydstyrke ned = Ctrl  (fx Vol- + c afbryder)\\n\"\n" +
        "printf \"  Lydstyrke op + w/a/s/d = piletaster, + e = Esc, + t = Tab\\n\"\n" +
        "printf \"  CTRL/ALT på ekstra-tasterne: tryk = én gang, hold = lås\\n\"\n" +
        "printf \"  Programmer i ~/bin kan køres direkte (chmod +x).\\n\"\n" +
        "printf \"  Kommandoer: toybox  |  liste over alt: ls /system/bin\\n\"\n";

    static String abi() { return Build.SUPPORTED_ABIS.length > 0 ? Build.SUPPORTED_ABIS[0] : "?"; }
}
