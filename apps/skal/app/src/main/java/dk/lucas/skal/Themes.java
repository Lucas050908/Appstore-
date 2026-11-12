package dk.lucas.skal;

import com.termux.terminal.TerminalColors;

import java.util.Properties;

/** Farvetemaer. Hvert tema: navn, baggrund, forgrund, markør, 16 ANSI-farver. */
final class Themes {
    static final String[] NAMES = {
        "Skal", "Dracula", "Nord", "Gruvbox", "Solarized mørk", "Monokai", "Retro grøn", "Lys"
    };

    private static final String[][] DATA = {
        { // Skal
            "#0E1116", "#D8DEE9", "#5EE6A0",
            "#1B2129", "#F0717A", "#5EE6A0", "#F2C46D", "#6CB6FF", "#C79BF2", "#5FD7D7", "#C8D0DB",
            "#4B5563", "#FF8F96", "#8AF5BE", "#FFD98C", "#93CBFF", "#DDB8FF", "#8AF0F0", "#FFFFFF"
        },
        { // Dracula
            "#282A36", "#F8F8F2", "#F8F8F2",
            "#21222C", "#FF5555", "#50FA7B", "#F1FA8C", "#BD93F9", "#FF79C6", "#8BE9FD", "#F8F8F2",
            "#6272A4", "#FF6E6E", "#69FF94", "#FFFFA5", "#D6ACFF", "#FF92DF", "#A4FFFF", "#FFFFFF"
        },
        { // Nord
            "#2E3440", "#D8DEE9", "#D8DEE9",
            "#3B4252", "#BF616A", "#A3BE8C", "#EBCB8B", "#81A1C1", "#B48EAD", "#88C0D0", "#E5E9F0",
            "#4C566A", "#BF616A", "#A3BE8C", "#EBCB8B", "#81A1C1", "#B48EAD", "#8FBCBB", "#ECEFF4"
        },
        { // Gruvbox
            "#282828", "#EBDBB2", "#EBDBB2",
            "#282828", "#CC241D", "#98971A", "#D79921", "#458588", "#B16286", "#689D6A", "#A89984",
            "#928374", "#FB4934", "#B8BB26", "#FABD2F", "#83A598", "#D3869B", "#8EC07C", "#EBDBB2"
        },
        { // Solarized mørk
            "#002B36", "#839496", "#93A1A1",
            "#073642", "#DC322F", "#859900", "#B58900", "#268BD2", "#D33682", "#2AA198", "#EEE8D5",
            "#002B36", "#CB4B16", "#586E75", "#657B83", "#839496", "#6C71C4", "#93A1A1", "#FDF6E3"
        },
        { // Monokai
            "#272822", "#F8F8F2", "#F8F8F0",
            "#272822", "#F92672", "#A6E22E", "#F4BF75", "#66D9EF", "#AE81FF", "#A1EFE4", "#F8F8F2",
            "#75715E", "#F92672", "#A6E22E", "#F4BF75", "#66D9EF", "#AE81FF", "#A1EFE4", "#F9F8F5"
        },
        { // Retro grøn
            "#050A05", "#33FF66", "#33FF66",
            "#050A05", "#2FBF55", "#33FF66", "#7CFF9B", "#1F9E44", "#2FBF55", "#5CFF85", "#33FF66",
            "#1A5C2A", "#4DFF7A", "#66FF8C", "#99FFB3", "#33CC5C", "#4DFF7A", "#80FFA3", "#CCFFD9"
        },
        { // Lys
            "#FAFAF7", "#24292F", "#24292F",
            "#24292F", "#CF222E", "#116329", "#9A6700", "#0550AE", "#8250DF", "#1B7C83", "#6E7781",
            "#57606A", "#A40E26", "#1A7F37", "#7D4E00", "#0969DA", "#A475F9", "#3192AA", "#8C959F"
        },
    };

    static int clamp(int i) { return (i < 0 || i >= DATA.length) ? 0 : i; }

    static int background(int i) { return android.graphics.Color.parseColor(DATA[clamp(i)][0]); }
    static int foreground(int i) { return android.graphics.Color.parseColor(DATA[clamp(i)][1]); }
    static boolean isLight(int i) { return clamp(i) == 7; }

    /** Sætter det globale farveskema. Kald derefter mColors.reset() på hver emulator. */
    static void apply(int i) {
        String[] d = DATA[clamp(i)];
        Properties p = new Properties();
        p.setProperty("background", d[0]);
        p.setProperty("foreground", d[1]);
        p.setProperty("cursor", d[2]);
        for (int c = 0; c < 16; c++) p.setProperty("color" + c, d[3 + c]);
        TerminalColors.COLOR_SCHEME.updateWith(p);
    }
}
