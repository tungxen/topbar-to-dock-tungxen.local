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

### Upgrading from the local prototype

The prototype UUID was `dock2@tungxen.local`. Disable it before switching:

```sh
gnome-extensions disable dock2@tungxen.local
```

Install the new package, log out and back in, and enable
`topbar-to-dock@tungxen.local`. The installed directory must match this UUID.
Icon padding settings use the new `org.gnome.shell.extensions.topbar-to-dock`
schema and start with defaults; prototype settings are not migrated automatically.
Ubuntu Dock's size and position settings are also retained.

## Build

From this directory:

```sh
glib-compile-schemas --strict schemas
mkdir -p dist
gnome-extensions pack --force --out-dir=dist --extra-source=LICENSE .
```

The archive contains the runtime code, preferences, stylesheet, metadata,
GSettings schema, and license. It does not contain the Git history or build output.

## Publishing

Sign in at <https://extensions.gnome.org/upload/> and submit the release ZIP.
Submissions are subject to GNOME's extension review before public availability.

The extension depends on Ubuntu Dock's internal interfaces and changes top bar
behavior. Reviewers may request changes before approving distribution.

Validation so far includes JavaScript syntax checks, GSettings schema compilation,
native settings binding checks, and simulated dock lifecycle tests. A full
interactive GNOME Shell test on a clean supported installation remains necessary
before describing the release as broadly tested.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
