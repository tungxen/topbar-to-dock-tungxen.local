import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class TopBarToDockPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const dockSettings = new Gio.Settings({schema_id: 'org.gnome.shell.extensions.dash-to-dock'});
        window._settings = settings;
        window._dockSettings = dockSettings;
        window.default_width = 480;
        window.default_height = 480;

        const page = new Adw.PreferencesPage({
            title: 'Top Bar to Dock',
            icon_name: 'preferences-desktop-display-symbolic',
        });
        window.add(page);
        const group = new Adw.PreferencesGroup({title: 'Dock Settings'});
        page.add(group);
        // Ubuntu Dock uses St.Side values: BOTTOM = 2, TOP = 0.
        const positions = [2, 0];
        const position = new Adw.ComboRow({
            title: 'Position',
            model: Gtk.StringList.new(['Bottom', 'Top']),
        });
        const syncPosition = () => {
            const index = positions.indexOf(dockSettings.get_enum('dock-position'));
            position.selected = index < 0 ? Gtk.INVALID_LIST_POSITION : index;
        };
        syncPosition();
        group.add(position);
        dockSettings.bind_writable('dock-position', position, 'sensitive', false);
        position.connect('notify::selected', () => {
            const value = positions[position.selected];
            if (value !== undefined && value !== dockSettings.get_enum('dock-position'))
                dockSettings.set_enum('dock-position', value);
        });
        const positionChangedId = dockSettings.connect('changed::dock-position', syncPosition);
        window.connect('close-request', () => {
            dockSettings.disconnect(positionChangedId);
            return false;
        });

        const iconSize = new Adw.SpinRow({
            title: 'Icon Size (px)',
            digits: 0,
            adjustment: new Gtk.Adjustment({
                lower: 16, upper: 64, step_increment: 1, page_increment: 8,
            }),
        });
        group.add(iconSize);
        dockSettings.bind('dash-max-icon-size', iconSize, 'value', Gio.SettingsBindFlags.DEFAULT);

        for (const [key, title] of [
            ['padding-horizontal', 'Left / Right Padding (px)'],
            ['padding-vertical', 'Top / Bottom Padding (px)'],
        ]) {
            const [, bounds] = settings.settings_schema.get_key(key).get_range().deep_unpack();
            const [minimum, maximum] = bounds.deep_unpack();
            const row = new Adw.SpinRow({
                title,
                digits: 0,
                adjustment: new Gtk.Adjustment({
                    lower: minimum, upper: maximum, step_increment: 1, page_increment: 4,
                }),
            });
            group.add(row);
            settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
        }

        const reset = new Gtk.Button({
            label: 'Reset',
            valign: Gtk.Align.CENTER,
            tooltip_text: 'Reset padding and position; set icon size to minimum',
        });
        reset.connect('clicked', () => {
            settings.reset('padding-horizontal');
            settings.reset('padding-vertical');
            dockSettings.set_int('dash-max-icon-size', iconSize.adjustment.get_lower());
            dockSettings.set_enum('dock-position', 2);
        });
        group.set_header_suffix(reset);
    }
}
