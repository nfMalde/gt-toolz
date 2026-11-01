# Updates and news

GT Toolz can look for new versions by itself and install them for you. You decide whether it may.

## Which builds look for updates

Only **official installed builds** look for updates: the installers from the [releases page](https://github.com/nfMalde/gt-toolz/releases). A build you made yourself from the source code, and the development mode, never look.

The update check is the only internet connection GT Toolz makes besides the [voice downloads](voices.md#download-neural-voices-the-voice-manager) you start yourself. See [Privacy](privacy.md).

## You are asked once

The first time you start GT Toolz 1.0.0 Beta, a **news window** shows what is new. On a new installation it comes after the first setup and the tour. It also asks once whether GT Toolz may **look for updates**. The box is ticked. Untick it if you do not want that, then close the window. Nothing is looked up before you answered.

You can change your answer any time: **Settings → Updates → Look for updates**. The same card shows your installed version and the result of the last look, with **Look now**.

## What happens at start

With **Look for updates** on, GT Toolz asks GitHub at every start whether the project [nfMalde/gt-toolz](https://github.com/nfMalde/gt-toolz) has a newer release.

Which versions you are offered depends on what you run:

| You run | You are offered |
|---|---|
| an alpha | newer alphas, betas and full releases |
| a beta (for example 1.0.0 Beta) | newer betas and full releases, never an alpha |
| a full release | newer full releases only |

If the look fails, for example without internet, nothing happens. GT Toolz works as usual.

## When a newer version exists

A window shows the new version and its changes (the release notes from GitHub), with two buttons:

- **Update**: downloads and installs the new version (see below).
- **Later**: closes the window. GT Toolz asks again at the next start.

Until you update, a button in the title bar shows the new version. Click it to start the update any time. You can also open the release on GitHub from the window.

## How the update installs

1. GT Toolz downloads the installer for your system. The window shows the progress.
2. It checks that the release's checksum list (`SHA256SUMS.txt`) is signed by the GT Toolz project, and the file's SHA-256 checksum against it. Without a valid signature, or when the file does not match, nothing is installed.
3. Then, depending on your system:

| System | What happens |
|---|---|
| **Windows** | The installer runs by itself. GT Toolz closes, and the new version starts. |
| **macOS** | The disk image opens. Quit GT Toolz, drag **GT Toolz** to **Applications**, and replace the old version. Then start it again. |
| **Linux** | The `.deb` file opens in your system's software installer. Install it there, then start GT Toolz again. |

On macOS and Linux the file is saved in your **Downloads** folder. If something goes wrong, the window shows the error and offers to try again.

Your settings, references, voices and recordings stay. An update never touches your [data folder](settings.md#where-your-data-is).

macOS may ask again on the first start of the new version, as on the first install. See [Getting started → macOS](getting-started.md#macos).

## Update by hand

You can always update without the update check:

1. Download the installer for your system from the [releases page](https://github.com/nfMalde/gt-toolz/releases).
2. Install it over the old version, as described in [Getting started](getting-started.md#install).

## News after an update

Every version brings a short news text: what is new and what changed. It is shown once, as a window, at the first start after the update. The news text comes with the app; showing it needs no internet.
