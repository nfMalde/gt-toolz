/** Windows ("C:\…", "C:/…"; not the "s:/" of "https://") or Unix home and system paths ("/home/…", "/Users/…"). */
const PATH_START = String.raw`(?:(?<!\w)[A-Za-z]:[\\/]|(?<![\w.~])\/(?:Users|home|root|var|tmp|opt|mnt|media|private|Volumes|run)\/)`;
/** Quoted (may contain spaces, as Node quotes them in error messages), else up to the next space. */
const QUOTED = new RegExp(String.raw`(['"])(${PATH_START}[^'"]*)\1`, 'g');
const BARE = new RegExp(String.raw`${PATH_START}[^\s"'<>|]*`, 'g');

/** The last part of a path, behind an ellipsis: "C:\Users\name\…\voice.wav" → "…\voice.wav". */
const shorten = (path: string): string => `…${/[\\/][^\\/]*$/.exec(path)?.[0] ?? ''}`;

/** A text (an error message) with its absolute paths cut down to the file name; URLs stay as they are. */
export function hidePaths(text: string): string {
  return text.replace(QUOTED, (_, quote: string, path: string) => `${quote}${shorten(path)}${quote}`).replace(BARE, shorten);
}
