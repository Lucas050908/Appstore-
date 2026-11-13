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
        script("skal-hjaelp", HELP);
        script("noter", NOTER);
        script("regn", REGN);
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

    /** Shell-funktioner: mkcd, up, gem/hop (bogmærker til mapper). */
    private static final String FUNCS =
        "# Små hjælpere – kan overskrives i ~/.shrc\n" +
        "mkcd() { [ -n \"$1\" ] || { echo \"Brug: mkcd <mappe>\"; return 1; }; mkdir -p \"$1\" && cd \"$1\"; }\n" +
        "up() { _skal_n=${1:-1}; while [ \"$_skal_n\" -gt 0 ] 2>/dev/null; do cd .. || break; _skal_n=$((_skal_n - 1)); done; unset _skal_n; }\n" +
        "gem() {\n" +
        "  case \"$1\" in \"\"|*/*|.*) echo \"Brug: gem <navn>   – husker den mappe, du står i\"; return 1;; esac\n" +
        "  mkdir -p \"$HOME/.skal/steder\" && pwd > \"$HOME/.skal/steder/$1\" && echo \"Gemt: $1 -> $PWD\"\n" +
        "}\n" +
        "hop() {\n" +
        "  if [ -z \"$1\" ]; then\n" +
        "    _skal_any=\n" +
        "    for _skal_f in \"$HOME\"/.skal/steder/*; do\n" +
        "      [ -f \"$_skal_f\" ] || continue\n" +
        "      _skal_any=1; printf '  %-12s %s\\n' \"${_skal_f##*/}\" \"$(cat \"$_skal_f\")\"\n" +
        "    done\n" +
        "    [ -n \"$_skal_any\" ] || echo \"Ingen gemte steder endnu. Stil dig i en mappe, og skriv: gem <navn>\"\n" +
        "    unset _skal_any _skal_f; return 0\n" +
        "  fi\n" +
        "  case \"$1\" in */*|.*) echo \"Ukendt sted: $1\"; return 1;; esac\n" +
        "  if [ \"$1\" = \"-s\" ]; then\n" +
        "    case \"$2\" in \"\"|*/*|.*) echo \"Brug: hop -s <navn>   – glemmer stedet\"; return 1;; esac\n" +
        "    rm -f \"$HOME/.skal/steder/$2\" && echo \"Glemt: $2\"; return 0\n" +
        "  fi\n" +
        "  if [ -f \"$HOME/.skal/steder/$1\" ]; then cd \"$(cat \"$HOME/.skal/steder/$1\")\"\n" +
        "  else echo \"Ukendt sted: $1   (se listen med: hop)\"; return 1; fi\n" +
        "}\n";

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
        FUNCS +
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
        "  \033[1mskal-hjaelp\033[0m huskeliste over kommandoer\n" +
        "  \033[1m~/bin\033[0m       læg dine egne scripts/programmer her\n" +
        "  \033[1m~/.shrc\033[0m     dine aliaser og variabler\n" +
        "  \033[2mSkjul denne besked: touch ~/.hushlogin\033[0m\n\n";

    private static final String HELP =
        "#!/system/bin/sh\n" +
        "b='\\033[1m'; d='\\033[2m'; g='\\033[1;32m'; n='\\033[0m'\n" +
        "p() { printf \"  ${b}%-22s${n} %s\\n\" \"$1\" \"$2\"; }\n" +
        "h() { printf \"\\n${g}%s${n}\\n\" \"$1\"; }\n" +
        "h \"Filer og mapper\"\n" +
        "p \"ls / ll / la\" \"vis filer (ll = detaljer, la = også skjulte)\"\n" +
        "p \"cd <mappe> / cd -\" \"skift mappe / tilbage til forrige\"\n" +
        "p \"mkcd <mappe>\" \"opret mappe og gå ind i den\"\n" +
        "p \"up [antal]\" \"gå et eller flere niveauer op\"\n" +
        "p \"cp / mv / rm\" \"kopiér / flyt / slet  (rm -r for mapper)\"\n" +
        "p \"cat / more / head\" \"vis indhold af en fil\"\n" +
        "p \"vi <fil>\" \"ret en fil  (i = skriv, Esc :wq = gem og luk)\"\n" +
        "h \"Find\"\n" +
        "p \"find . -name '*.txt'\" \"find filer efter navn\"\n" +
        "p \"grep -rn tekst .\" \"søg i filers indhold\"\n" +
        "p \"du -sh * | sort -h\" \"hvad fylder mest her?\"\n" +
        "h \"System og netværk\"\n" +
        "p \"skal-info\" \"enhed, Android-version og mapper\"\n" +
        "p \"df -h / free -m\" \"plads på lager / hukommelse\"\n" +
        "p \"top -n 1 / ps -A\" \"hvad kører lige nu?\"\n" +
        "p \"ip addr / ping -c 3 dr.dk\" \"netværk\"\n" +
        "p \"getprop | grep model\" \"oplysninger om telefonen\"\n" +
        "h \"Skals egne\"\n" +
        "p \"gem <navn> / hop <navn>\" \"husk en mappe / hop til den  (hop = vis alle)\"\n" +
        "p \"noter [tekst]\" \"hurtige noter  (noter -h for mere)\"\n" +
        "p \"regn '2+2*3'\" \"lommeregner\"\n" +
        "p \"Menu > Kommandoer\" \"dine gemte kommandoer med ét tryk\"\n" +
        "printf \"\\n${d}Egne scripts lægges i ~/bin (chmod +x). Aliaser i ~/.shrc.${n}\\n\\n\"\n";

    private static final String NOTER =
        "#!/system/bin/sh\n" +
        "# noter – hurtige noter i ~/noter.txt\n" +
        "f=\"$HOME/noter.txt\"\n" +
        "case \"$1\" in\n" +
        "  -h|--help)\n" +
        "    echo \"noter               vis alle noter\"\n" +
        "    echo \"noter <tekst>       tilføj en note\"\n" +
        "    echo \"noter -s <nr>       slet note nummer <nr>\"\n" +
        "    echo \"noter -r            ret noterne i vi\"\n" +
        "    exit 0;;\n" +
        "  -r) command -v vi >/dev/null 2>&1 || { echo \"vi findes ikke på denne telefon. Noterne ligger i $f\"; exit 1; }; exec vi \"$f\";;\n" +
        "  -s)\n" +
        "    case \"$2\" in \"\"|*[!0-9]*) echo \"Brug: noter -s <nr>\"; exit 1;; esac\n" +
        "    [ -f \"$f\" ] || { echo \"Ingen noter endnu.\"; exit 1; }\n" +
        "    n=0; hit=\n" +
        "    while IFS= read -r l || [ -n \"$l\" ]; do\n" +
        "      n=$((n + 1))\n" +
        "      if [ \"$n\" = \"$2\" ]; then hit=1; else printf '%s\\n' \"$l\"; fi\n" +
        "    done < \"$f\" > \"$f.tmp\"\n" +
        "    if [ -n \"$hit\" ]; then mv \"$f.tmp\" \"$f\"; echo \"Note $2 slettet.\"; else rm -f \"$f.tmp\"; echo \"Der er ingen note nummer $2.\"; exit 1; fi\n" +
        "    exit 0;;\n" +
        "  \"\")\n" +
        "    if [ ! -s \"$f\" ]; then echo \"Ingen noter endnu. Skriv fx: noter husk at tage backup\"; exit 0; fi\n" +
        "    n=0\n" +
        "    while IFS= read -r l || [ -n \"$l\" ]; do n=$((n + 1)); printf '%3d  %s\\n' \"$n\" \"$l\"; done < \"$f\"\n" +
        "    exit 0;;\n" +
        "esac\n" +
        "printf '%s  %s\\n' \"$(date '+%d/%m %H:%M')\" \"$*\" >> \"$f\" && echo \"Noteret.\"\n";

    private static final String REGN =
        "#!/system/bin/sh\n" +
        "# regn – lommeregner: regn \"2+2*3\"   regn 10/4\n" +
        "[ $# -gt 0 ] || { echo \"Brug: regn <regnestykke>   fx: regn 12.5*4   eller: regn '(3+4)*2'\"; exit 1; }\n" +
        "e=$(printf '%s' \"$*\" | tr ',x' '.*')\n" +
        "case \"$e\" in *[!0-9.+*/%\\(\\)\\ ^-]*) echo \"Kun tal og + - * / % ^ ( ) er tilladt.\"; exit 1;; esac\n" +
        "if command -v bc >/dev/null 2>&1; then r=$(printf 'scale=6; %s\\n' \"$e\" | bc -l 2>/dev/null)\n" +
        "elif command -v awk >/dev/null 2>&1; then r=$(awk \"BEGIN { printf \\\"%.6f\\\", $e }\" 2>/dev/null)\n" +
        "else r=$(( e )) 2>/dev/null; fi\n" +
        "[ -n \"$r\" ] || { echo \"Det kunne jeg ikke regne ud.\"; exit 1; }\n" +
        "# fjern overflødige nuller efter kommaet\n" +
        "case \"$r\" in *.*) r=$(printf '%s' \"$r\" | sed 's/0*$//; s/\\.$//');; esac\n" +
        "case \"$r\" in .*) r=\"0$r\";; -.*) r=\"-0${r#-}\";; esac\n" +
        "echo \"$r\"\n";

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
        "printf \"  Kommandoer: toybox  |  liste over alt: ls /system/bin\\n\"\n" +
        "printf \"  Huskeliste: skal-hjaelp  |  gemte kommandoer: menu > Kommandoer\\n\"\n";

    static String abi() { return Build.SUPPORTED_ABIS.length > 0 ? Build.SUPPORTED_ABIS[0] : "?"; }
}
