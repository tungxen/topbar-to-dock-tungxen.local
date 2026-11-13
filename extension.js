import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';

import {Extension, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SYSTEM_ROLES = new Set([
    'activities', 'dateMenu', 'quickSettings', 'a11y', 'keyboard',
    'dwellClick', 'screenRecording', 'screenSharing',
]);

export default class TopBarToDockExtension extends Extension {
    enable() {
        this._panelPlacements = new Map();
        this._paddingActors = new Map();
        this._settings = this.getSettings();
        this._settingsChangedId = this._settings.connect('changed', () => this._applyIconPadding());
        this._desktopWindows = new Map();
        this._workspaceChangedId = global.workspace_manager.connect(
            'active-workspace-changed', () => this._syncDesktopButton());
        // Move new tray icons after GNOME has finished registering them.
        this._panelInjections = new InjectionManager();
        const extension = this;
        this._panelInjections.overrideMethod(Main.panel, 'addToStatusArea', original => function (...args) {
            const result = original.apply(this, args);
            extension._syncTrayIcons();
            return result;
        });
        this._extensionChangedId = Main.extensionManager.connect(
            'extension-state-changed', (_manager, extension) => {
                if (extension.uuid === 'ubuntu-dock@ubuntu.com')
                    this._watchDock();
            });
        this._watchDock();
        this._hideTopbar();
    }

    _hideTopbar() {
        const layout = Main.layoutManager;
        const box = layout.panelBox;
        const tracked = layout._trackedActors.find(item => item.actor === box);
        this._topbarState = {
            box, tracked, visible: box.visible,
            affectsStruts: tracked?.affectsStruts,
            trackFullscreen: tracked?.trackFullscreen,
            heightDescriptor: Object.getOwnPropertyDescriptor(Main.panel, 'height'),
        };
        if (tracked) {
            // Hiding the actor alone does not remove its reserved work area.
            tracked.affectsStruts = false;
            tracked.trackFullscreen = false;
        }
        this._topbarInjections = new InjectionManager();
        this._topbarInjections.overrideMethod(layout, '_updatePanelBarrier',
            () => () => layout._destroyPanelBarrier());
        this._panelVisibleId = box.connect('notify::visible', () => {
            if (box.visible)
                box.hide();
        });
        box.hide();
        // Ubuntu Dock uses this value to offset docks along the top edge.
        Object.defineProperty(Main.panel, 'height', {configurable: true, get: () => 0});
        Main.panel.notify('height');
        layout._destroyPanelBarrier();
        layout._queueUpdateRegions();
    }

    _restoreTopbar() {
        const saved = this._topbarState;
        this._topbarState = null;
        if (!saved)
            return;

        saved.box.disconnect(this._panelVisibleId);
        this._panelVisibleId = 0;
        this._topbarInjections.clear();
        this._topbarInjections = null;
        if (saved.heightDescriptor)
            Object.defineProperty(Main.panel, 'height', saved.heightDescriptor);
        else
            delete Main.panel.height;
        Main.panel.notify('height');
        if (saved.tracked) {
            saved.tracked.affectsStruts = saved.affectsStruts;
            saved.tracked.trackFullscreen = saved.trackFullscreen;
        }
        saved.box.visible = saved.visible;
        Main.layoutManager._updatePanelBarrier();
        Main.layoutManager._queueUpdateRegions();
    }

    async _watchDock() {
        // Ignore an import that finishes after disable() or a newer request.
        const token = this._bindToken = Symbol();
        const extension = Main.extensionManager.lookup('ubuntu-dock@ubuntu.com');
        if (!extension?.stateObj)
            return;

        try {
            const module = await import(extension.dir.get_child('extension.js').get_uri());
            if (this._bindToken !== token)
                return;

            const manager = module.dockManager;
            if (manager !== this._dockManager) {
                this._unwatchDock();
                if (manager) {
                    this._dockManager = manager;
                    this._docksReadyId = manager.connect('docks-ready', () => this._syncDock());
                    this._dockDestroyId = manager.connect('destroy', () => this._unwatchDock());
                }
            }
            this._syncDock();
        } catch (error) {
            if (this._bindToken === token)
                console.error('Top Bar to Dock: could not watch Ubuntu Dock', error);
        }
    }

    _unwatchDock() {
        this._restoreIconPadding();
        this._restoreShowApps();
        if (this._dockManager) {
            this._dockManager.disconnect(this._docksReadyId);
            this._dockManager.disconnect(this._dockDestroyId);
        }
        this._dockManager = null;
        this._docksReadyId = 0;
        this._dockDestroyId = 0;
        this._desktopButton?.destroy();
        this._desktopButton = null;
        this._restorePanelItems();
    }

    _syncDock() {
        const dash = this._dockManager?.mainDock?.dash;
        const container = dash?._dashContainer;
        if (container && this._desktopButton?.get_parent() === container &&
            ['dateMenu', 'quickSettings', 'activities'].every(role =>
                this._panelPlacements.get(role)?.actor.get_parent() === container)) {
            this._arrangeShowApps();
            this._syncTrayIcons();
            return;
        }

        this._restoreShowApps();
        this._desktopButton?.destroy();
        this._restorePanelItems();
        if (!container)
            return;

        this._movePanelItem('dateMenu', 'dock2-clock', dash, container);
        this._movePanelItem('quickSettings', 'dock2-system', dash, container);
        this._movePanelItem('activities', 'dock2-activities', dash, container);
        this._syncTrayIcons();
        this._addDesktopButton(dash, container);
        this._moveShowApps(dash, container);
    }

    _moveShowApps(dash, container) {
        const actor = dash._showAppsIcon;
        const parent = actor.get_parent();
        this._showAppsPlacement = {
            actor, parent, dash, container,
            index: parent.get_children().indexOf(actor),
            destroyId: container.connect('destroy', () => this._restoreShowApps(false)),
        };
        this._dockInjections = new InjectionManager();
        const extension = this;
        this._dockInjections.overrideMethod(dash, 'updateShowAppsButton', original => function (...args) {
            const result = original.apply(this, args);
            extension._arrangeShowApps();
            extension._applyIconPadding();
            return result;
        });
        this._arrangeShowApps();
        this._applyIconPadding();
    }

    _arrangeShowApps() {
        const saved = this._showAppsPlacement;
        const activities = this._panelPlacements.get('activities')?.actor;
        if (!saved || activities?.get_parent() !== saved.container)
            return;

        const {actor, container, dash} = saved;
        actor.get_parent()?.remove_child(actor);
        const rtl = dash._isHorizontal &&
            container.get_text_direction() === Clutter.TextDirection.RTL;
        const index = container.get_children().indexOf(activities);
        container.insert_child_at_index(actor, rtl ? index : index + 1);
    }

    _restoreShowApps(update = true) {
        this._dockInjections?.clear();
        this._dockInjections = null;
        const saved = this._showAppsPlacement;
        this._showAppsPlacement = null;
        if (!saved)
            return;

        const {actor, parent, container, index, dash, destroyId} = saved;
        container.disconnect(destroyId);
        actor.get_parent()?.remove_child(actor);
        parent.insert_child_at_index(actor, Math.min(index, parent.get_n_children()));
        if (update)
            dash.updateShowAppsButton();
    }

    _addDesktopButton(dash, container) {
        const button = new St.Button({
            style_class: `dock2-desktop ${dash._isHorizontal ? 'horizontal' : 'vertical'}`,
            accessible_name: 'Show Desktop',
            can_focus: true,
            track_hover: true,
            x_expand: !dash._isHorizontal,
            y_expand: dash._isHorizontal,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
        });
        button.connect('clicked', () => this._toggleDesktop());
        button.connect('destroy', () => {
            if (this._desktopButton === button)
                this._desktopButton = null;
        });
        this._desktopButton = button;
        const rtl = dash._isHorizontal &&
            container.get_text_direction() === Clutter.TextDirection.RTL;
        container.insert_child_at_index(button, rtl ? container.get_n_children() : 0);
        this._syncDesktopButton();
    }

    _toggleDesktop() {
        const workspace = global.workspace_manager.get_active_workspace();
        Main.overview.hide();
        if (this._desktopWindows.has(workspace)) {
            this._restoreDesktop(workspace);
            return;
        }

        // Remember only windows minimized by this button, in stacking order.
        const windows = global.display.sort_windows_by_stacking(
            global.display.get_tab_list(Meta.TabList.NORMAL_ALL, workspace)
                .filter(window => !window.minimized && window.can_minimize()));
        if (windows.length === 0)
            return;
        const record = {windows: new Map(), focus: global.display.focus_window};
        this._desktopWindows.set(workspace, record);
        for (const window of windows) {
            const id = window.connect('unmanaged', () => {
                record.windows.delete(window);
                if (record.focus === window)
                    record.focus = null;
                if (record.windows.size === 0)
                    this._desktopWindows.delete(workspace);
                this._syncDesktopButton();
            });
            record.windows.set(window, id);
            window.minimize();
        }
        this._syncDesktopButton();
    }

    _restoreDesktop(workspace, activate = true) {
        const record = this._desktopWindows.get(workspace);
        if (!record)
            return;
        this._desktopWindows.delete(workspace);
        for (const [window, id] of record.windows) {
            window.disconnect(id);
            if (window.minimized)
                window.unminimize();
        }
        if (activate && record.windows.has(record.focus))
            record.focus.activate(global.get_current_time());
        this._syncDesktopButton();
    }

    _syncDesktopButton() {
        if (!this._desktopButton)
            return;
        const active = this._desktopWindows.has(global.workspace_manager.get_active_workspace());
        this._desktopButton.checked = active;
        this._desktopButton.accessible_name = active ? 'Restore Windows' : 'Show Desktop';
    }

    _syncTrayIcons() {
        const dash = this._dockManager?.mainDock?.dash;
        const container = dash?._dashContainer;
        if (!container)
            return;

        const boxes = [Main.panel._leftBox, Main.panel._centerBox, Main.panel._rightBox];
        const roles = Object.keys(Main.panel.statusArea).filter(role => {
            const actor = Main.panel.statusArea[role]?.container;
            return !SYSTEM_ROLES.has(role) && actor && boxes.includes(actor.get_parent());
        });
        for (const role of roles) {
            // An indicator may have been re-registered in a different panel box.
            this._restorePanelItem(role);
            this._movePanelItem(role, 'dock2-tray', dash, container);
            const actor = this._panelPlacements.get(role)?.actor;
            const clock = this._panelPlacements.get('dateMenu')?.actor;
            if (actor && clock?.get_parent() === container) {
                const rtl = dash._isHorizontal &&
                    container.get_text_direction() === Clutter.TextDirection.RTL;
                container.remove_child(actor);
                const index = container.get_children().indexOf(clock);
                container.insert_child_at_index(actor, rtl ? index + 1 : index);
            }
        }
        this._applyIconPadding();
    }

    _applyIconPadding() {
        const dash = this._dockManager?.mainDock?.dash;
        if (!dash)
            return;

        const horizontal = this._settings.get_int('padding-horizontal');
        const vertical = this._settings.get_int('padding-vertical');
        const buttons = [dash.showAppsButton, ...dash.getAppIcons()];
        for (const actor of buttons.filter(Boolean)) {
            // Keep spacing and the hover background on the same outer button.
            this._setActorPadding(actor, `padding: ${vertical}px ${horizontal}px;`, 'dock2-app-button');
            const icon = actor.icon ?? actor.child;
            if (icon)
                this._setActorPadding(icon, 'padding: 0px; background-color: transparent; box-shadow: none;');
        }

        for (const [role, saved] of this._panelPlacements) {
            if (role === 'dateMenu')
                continue;
            // Native panel buttons allocate horizontal padding themselves.
            this._setActorPadding(saved.indicator,
                `-minimum-hpadding: ${horizontal}px; -natural-hpadding: ${horizontal}px;`);
            const child = saved.indicator.get_first_child();
            if (child !== saved.paddingChild)
                this._restoreActorPadding(saved.paddingChild);
            saved.paddingChild = child;
            if (child)
                this._setActorPadding(child, `padding-top: ${vertical}px; padding-bottom: ${vertical}px;`);
        }
    }

    _setActorPadding(actor, padding, styleClass = null) {
        if (!this._paddingActors.has(actor)) {
            const destroyId = actor.connect('destroy', () => this._paddingActors.delete(actor));
            this._paddingActors.set(actor, {style: actor.get_style(), destroyId});
        }
        const saved = this._paddingActors.get(actor);
        if (styleClass && !actor.has_style_class_name(styleClass)) {
            actor.add_style_class_name(styleClass);
            saved.addedClass = styleClass;
        }
        saved.applied = `${saved.style ? `${saved.style}; ` : ''}${padding}`;
        if (actor.get_style() !== saved.applied)
            actor.set_style(saved.applied);
    }

    _restoreActorPadding(actor) {
        const saved = this._paddingActors.get(actor);
        if (!saved)
            return;
        this._paddingActors.delete(actor);
        actor.disconnect(saved.destroyId);
        if (saved.addedClass)
            actor.remove_style_class_name(saved.addedClass);
        if (actor.get_style() === saved.applied)
            actor.set_style(saved.style);
    }

    _restoreIconPadding() {
        for (const actor of [...this._paddingActors.keys()])
            this._restoreActorPadding(actor);
    }

    _movePanelItem(role, styleClass, dash, container) {
        const indicator = Main.panel.statusArea[role];
        const actor = indicator?.container;
        const parent = actor?.get_parent();
        if (!parent)
            return;

        const saved = {
            actor, parent, indicator, container, styleClass, dash,
            index: parent.get_children().indexOf(actor),
        };
        this._panelPlacements.set(role, saved);
        this._watchPanelMenu(saved);
        saved.menuSetId = indicator.connect('menu-set', () => this._watchPanelMenu(saved));
        saved.actorDestroyId = actor.connect('destroy', () => this._restorePanelItem(role, true));
        // Rescue native panel items before dock teardown destroys its children.
        saved.destroyId = container.connect('destroy', () => this._restorePanelItems());
        indicator.add_style_class_name(styleClass);
        parent.remove_child(actor);
        // Activities goes left/top; other panel items go right/bottom.
        const rtl = dash._isHorizontal &&
            container.get_text_direction() === Clutter.TextDirection.RTL;
        const atStart = role === 'activities';
        container.insert_child_at_index(actor, atStart !== rtl ? 0 : container.get_n_children());
    }

    _restorePanelItems() {
        // Reverse removal order preserves positions within each original panel box.
        for (const role of [...this._panelPlacements.keys()].reverse())
            this._restorePanelItem(role);
    }

    _watchPanelMenu(saved) {
        this._unwatchPanelMenu(saved);
        const menu = saved.indicator.menu;
        // Legacy tray icons handle clicks themselves and may have no popup menu.
        if (!menu?._boxPointer)
            return;

        menu.close();
        saved.menu = menu;
        saved.arrowSide = menu._arrowSide;
        saved.userArrowSide = menu._boxPointer._userArrowSide;
        menu._arrowSide = saved.dash._position;
        menu._boxPointer.updateArrowSide(saved.dash._position);
        saved.menuId = menu.connect('open-state-changed', (_menu, opened) => {
            saved.menuOpen = opened;
            saved.dash.emit(opened ? 'menu-opened' : 'menu-closed');
        });
        saved.menuDestroyId = menu.connect('destroy', () => {
            if (saved.menuOpen)
                saved.dash.emit('menu-closed');
            saved.menuOpen = false;
            saved.menu = null;
        });
    }

    _unwatchPanelMenu(saved) {
        const menu = saved.menu;
        if (!menu)
            return;
        menu.close();
        menu.disconnect(saved.menuId);
        menu.disconnect(saved.menuDestroyId);
        menu._arrowSide = saved.arrowSide;
        menu._boxPointer.updateArrowSide(saved.userArrowSide);
        saved.menu = null;
    }

    _restorePanelItem(role, destroyed = false) {
        const saved = this._panelPlacements.get(role);
        this._panelPlacements.delete(role);
        if (!saved)
            return;

        const {actor, parent, indicator, container, index, styleClass} = saved;
        this._unwatchPanelMenu(saved);
        indicator.disconnect(saved.menuSetId);
        actor.disconnect(saved.actorDestroyId);
        container.disconnect(saved.destroyId);
        if (destroyed)
            return;
        this._restoreActorPadding(indicator);
        this._restoreActorPadding(saved.paddingChild);
        indicator.remove_style_class_name(styleClass);
        if (actor.get_parent() === container) {
            container.remove_child(actor);
            parent.insert_child_at_index(actor, Math.min(index, parent.get_n_children()));
        }
    }

    disable() {
        this._bindToken = null;
        this._settings.disconnect(this._settingsChangedId);
        this._settingsChangedId = 0;
        global.workspace_manager.disconnect(this._workspaceChangedId);
        this._workspaceChangedId = 0;
        for (const workspace of this._desktopWindows.keys())
            this._restoreDesktop(workspace, false);
        this._panelInjections.clear();
        this._panelInjections = null;
        if (this._extensionChangedId) {
            Main.extensionManager.disconnect(this._extensionChangedId);
            this._extensionChangedId = 0;
        }
        this._unwatchDock();
        this._restoreTopbar();
        this._settings = null;
    }
}
