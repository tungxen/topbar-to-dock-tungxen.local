# Top Bar to Dock

Move GNOME's calendar, notifications, Quick Settings, Activities, and background
app tray icons into Ubuntu Dock. Hide the top bar and reclaim screen space, with
Show Desktop, dock position, icon size, and icon padding settings.

## Requirements

- GNOME Shell 50.
- Ubuntu Dock (`ubuntu-dock@ubuntu.com`) installed and enabled.
- An indicator provider, such as Ubuntu AppIndicators, for background app icons.

This extension uses Ubuntu Dock's internal APIs. Other dock implementations and
GNOME Shell versions are not currently supported.

## Features

- Move Activities and Show Apps to the left of the dock.
- Add a small Show Desktop strip before Activities. Click again to restore the
  windows minimized by the strip on the current workspace.
- Move background app indicators, the calendar and notification menu, and Quick
  Settings to the dock.
- Hide the top bar and release its reserved screen area.
- Configure Bottom/Top position, icon size, and horizontal/vertical icon padding.
- Restore native controls and styles when disabled.

## Install a release ZIP

```sh
gnome-extensions install topbar-to-dock@tungxen.local.shell-extension.zip
```

Log out and back in, then enable the extension:

```sh
gnome-extensions enable topbar-to-dock@tungxen.local
gnome-extensions prefs topbar-to-dock@tungxen.local
```

Settings are also available through Extension Manager.
https://extensions.gnome.org/extension/11755/top-bar-to-dock/

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
