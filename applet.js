
const Applet    = imports.ui.applet;
const St        = imports.gi.St;
const Lang      = imports.lang;
const PopupMenu = imports.ui.popupMenu;
const Settings  = imports.ui.settings;
const GLib      = imports.gi.GLib;
const Signals   = imports.signals;

const EXTENSION_UUID = "timepp@zagortenay333";
const AppletDir = imports.ui.appletManager.applets[EXTENSION_UUID];
const Timer     = AppletDir.sections.timer;
const Stopwatch = AppletDir.sections.stopwatch;
const Pomodoro  = AppletDir.sections.pomodoro;
const Alarms    = AppletDir.sections.alarms;
const Todo      = AppletDir.sections.todo;


const PANEL_ITEM    = AppletDir.lib.panel_item;
const ICON_FROM_URI = AppletDir.lib.icon_from_uri;


// l10n/translation
const Gettext = imports.gettext;
let UUID;

function _(str) {
   let custom_translation = Gettext.dgettext(UUID, str);
   if (custom_translation !== str) return custom_translation;
   return Gettext.gettext(str);
}

function ngettext(str1, str2, n) {
   let custom_translation = Gettext.dngettext(UUID, str1, str2, n);
   if (custom_translation !== str1 && custom_translation !== str2)
        return custom_translation;
   return Gettext.ngettext(str1, str2, n);
}


// =====================================================================
// @@@ Applet
// =====================================================================
function MyApplet(metadata, orientation, panel_height, instance_id) {
    this._init(metadata, orientation, panel_height, instance_id);
}

MyApplet.prototype = {
    __proto__: Applet.Applet.prototype,

    _init: function(metadata, orientation, panel_height, instance_id) {
        Applet.Applet.prototype._init.call(this, orientation, panel_height, instance_id);

        this.actor.style_class = 'timepp-panel-box';
        this.setAllowedLayout(Applet.AllowedLayout.BOTH); // enable vert panel


        //
        // l10n/translation
        //
        UUID = metadata.uuid;
        Gettext.bindtextdomain(UUID, GLib.get_home_dir() + '/.local/share/locale');


        this.metadata     = metadata;
        this.orientation  = orientation;
        this.panel_height = panel_height;
        this.instance_id  = instance_id;


        this.settings = new Settings.AppletSettings(this, metadata.uuid, instance_id);
        this.settings.bind('unicon_mode', 'unicon_mode', this._toggle_unicon_mode);
        this.settings.bind('unicon', 'unicon', this._update_unicon);

        this.section_register   = [];
        this.separator_register = [];


        //
        // menu
        //
        this.menuManager = new PopupMenu.PopupMenuManager(this);

        this.menu = new Applet.AppletPopupMenu(this, orientation);
        this.menuManager.addMenu(this.menu);
        this.menu.setCustomStyleClass('timepp-menu');

        this._contentSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._contentSection);

        this.mainBox = new St.BoxLayout({ style_class: 'timepp-content-box', vertical: true});
        this._contentSection.actor.add_actor(this.mainBox);


        //
        // unicon panel item (shown when single panel item mode is selected)
        //
        this.unicon_panel_item = new PANEL_ITEM.PanelItem(this, metadata, orientation, 'Time ++');

        this.unicon_panel_item.set_mode('icon');
        this.unicon_panel_item.actor.add_style_class_name('unicon-panel-item');
        this._update_unicon_name();

        if (! this.unicon_mode) this.unicon_panel_item.actor.hide();

        this.actor.add_actor(this.unicon_panel_item.actor);


        //
        // timer section
        //
        this.timer_section = new Timer.Timer(this, this.settings, metadata, instance_id, orientation);
        this.mainBox.add_actor(this.timer_section.actor);
        this.section_register.push(this.timer_section);
        //
        // separator
        //
        this._add_separator(this.mainBox);


        //
        // stopwatch section
        //
        this.stopwatch_section = new Stopwatch.Stopwatch(this, this.settings, metadata, instance_id, orientation);
        this.mainBox.add_actor(this.stopwatch_section.actor);
        this.section_register.push(this.stopwatch_section);
        //
        // separator
        //
        this._add_separator(this.mainBox);


        //
        // pomodoro section
        //
        this.pomodoro_section = new Pomodoro.Pomodoro(this, this.settings, metadata, instance_id, orientation);
        this.mainBox.add_actor(this.pomodoro_section.actor);
        this.section_register.push(this.pomodoro_section);
        //
        // separator
        //
        this._add_separator(this.mainBox);


        //
        // alarms section
        //
        this.alarms_section = new Alarms.Alarms(this, this.settings, metadata, instance_id, orientation);
        this.mainBox.add_actor(this.alarms_section.actor);
        this.section_register.push(this.alarms_section);
        //
        // separator
        //
        this._add_separator(this.mainBox);


        //
        // todo section
        //
        this.todo_section = new Todo.Todo(this, this.settings, metadata, instance_id, orientation);
        this.mainBox.add_actor(this.todo_section.actor);
        this.section_register.push(this.todo_section);


        //
        // Hide panel items of sections that are not enabled or hide all if
        // unicon mode is on.
        //
        for (let i = 0, len = this.section_register.length; i < len; i++) {
            let section = this.section_register[i];

            if ((! section.cache.enabled) || this.unicon_mode)
                section.panel_item.actor.hide();
        }


        //
        // build context menu
        //
        for (let i = 0, len = this.section_register.length; i < len; i++) {
            let section = this.section_register[i];
            let state = section.cache.enabled ? true : false;

            let item = new PopupMenu.PopupSwitchMenuItem(section.section_name, state);
            item.connect('toggled', Lang.bind(this, this._section_toggled));
            this._applet_context_menu.addMenuItem(item);
        }

        this.context_items = this._applet_context_menu._getMenuItems();
        this._toggle_sensitivity();


        //
        // listen
        //
        this.unicon_panel_item.connect('click', Lang.bind(this, this.toggle_menu));
        this.timer_section.connect('toggle-menu', Lang.bind(this, this.toggle_menu));
        this.stopwatch_section.connect('toggle-menu', Lang.bind(this, this.toggle_menu));
        this.pomodoro_section.connect('toggle-menu', Lang.bind(this, this.toggle_menu));
        this.pomodoro_section.connect('stop-time-tracking', () => { this.emit('stop-time-tracking') });
        this.alarms_section.connect('toggle-menu', Lang.bind(this, this.toggle_menu));
        this.todo_section.connect('toggle-menu', Lang.bind(this, this.toggle_menu));
    },

    // This function should be called every time a context menu item is toggled.
    // If there is only one toggled item left in the context menu, make it
    // non-sensitive.
    _toggle_sensitivity: function () {
        let toggled_counter = 0;
        let insensitive_item;
        let toggled_item;

        for (let i = 0, len = this.context_items.length; i < len; i++) {
            let item = this.context_items[i];

            // Find number of toggled items, the latest toggled item, and a
            // potential insensitive item.
            if (item.state) {
                toggled_counter++;
                toggled_item = item;
            }

            if (! item.sensitive) insensitive_item = item;
        }

        if (toggled_counter === 1) toggled_item.setSensitive(false);
        else if (insensitive_item) insensitive_item.setSensitive(true);
    },

    // We enable/disable a section and hide/show it's panel item, and then we
    // call a method of the corresponding section to handle the rest.
    // If only one enabled section remains, the corresponding item in the
    // context menu is disabled.
    _section_toggled: function (item, state) {
        let name = item.label.text;

        if (state) {
            for (let i = 0, len = this.section_register.length; i < len; i++) {
                let section = this.section_register[i];

                if (name === section.section_name) {
                    section.cache.enabled = true;
                    if (! this.unicon_mode) section.panel_item.actor.show();
                    section.toggle_section();
                    break;
                }
            }

            this._toggle_sensitivity();
        }
        else {
            for (let i = 0, len = this.section_register.length; i < len; i++) {
                let section = this.section_register[i];

                if (name === section.section_name) {
                    section.cache.enabled = false;
                    section.panel_item.actor.hide();
                    section.toggle_section();
                    break;
                }
            }

            this._toggle_sensitivity();
        }
    },

    // If we are a separate menu, we show it and hide all other menus.
    // If we are not a sep menu, we hide all sep menus and show all others.
    // A menu won't be shown if it's not enabled.
    toggle_menu: function (section) {
        if (this.menu.isOpen) this.menu.close(false);
        else                  this.open_menu(section);
    },

    open_menu: function (section) {
        if (! section.section_name) { // unicon clicked
            this.unicon_panel_item._menu_toggled(true)

            for (let i = 0, len = this.section_register.length; i < len; i++) {
                let section = this.section_register[i];
                if (section.cache.enabled) this.section_register[i].actor.show();
                else this.section_register[i].actor.hide();
            }
        }
        else if (section.separate_menu) {
            let name = section.section_name;

            section.actor.show();
            section.panel_item._menu_toggled(true)

            for (let i = 0, len = this.section_register.length; i < len; i++) {
                if (name !== this.section_register[i].section_name) {
                    this.section_register[i].actor.hide();
                    this.section_register[i].panel_item._menu_toggled(false)
                }
            }
        }
        else {
            for (let i = 0, len = this.section_register.length; i < len; i++) {
                section = this.section_register[i];

                if ( section.separate_menu || (! section.cache.enabled) ) {
                    this.section_register[i].actor.hide();
                    this.section_register[i].panel_item._menu_toggled(false)
                }
                else {
                    this.section_register[i].actor.show();
                    this.section_register[i].panel_item._menu_toggled(true)
                }
            }
        }

        this._update_separators();
        this.menu.open(false);
    },

    _update_separators: function () {
        let reg  = this.section_register;
        let flag = reg[0].actor.visible ? true : false;
        let len  = this.section_register.length;

        for (let i = 1; i < len; i++)
            if (reg[i].actor.visible) {
                if (flag)
                    this.separator_register[i - 1].show();
                else
                    this.separator_register[i - 1].hide();

                flag = true;
            }
            else
                this.separator_register[i - 1].hide();
    },

    _add_separator: function (container) {
        let sep = new PopupMenu.PopupSeparatorMenuItem();
        sep.actor.add_style_class_name('timepp-separator');

        this.separator_register.push(sep.actor);

        container.add_actor(sep.actor);
    },

    _toggle_unicon_mode: function () {
        if (this.unicon_mode) {
            this.unicon_panel_item.actor.show();

            for (let i = 0, len = this.section_register.length; i < len; i++)
                this.section_register[i].panel_item.actor.hide();

        }
        else {
            this.unicon_panel_item.actor.hide();

            for (let i = 0, len = this.section_register.length; i < len; i++) {
                let section = this.section_register[i];
                if (section.cache.enabled)
                    this.section_register[i].panel_item.actor.show();
            }
        }
    },

    _update_unicon_name: function() {
        ICON_FROM_URI.icon_from_uri(this.unicon_panel_item.icon, this.unicon, this.metadata);
        // If the path was relative the set_icon_name_from_path will convert to
        // absolute. We update the timer_icon in order to not have a broken
        // icon in the applet gtk settings window.
        this.unicon = this.unicon_panel_item.icon.get_gicon().to_string();
    },

    on_applet_removed_from_panel: function () {
        this.timer_section.on_applet_removed_from_panel();
        this.stopwatch_section.on_applet_removed_from_panel();
        this.pomodoro_section.on_applet_removed_from_panel();
        this.alarms_section.on_applet_removed_from_panel();
        this.todo_section.on_applet_removed_from_panel();

        this.settings.finalize();
        this.menu.destroy();
        this.menuManager = null;
    },

    on_orientation_changed: function (orientation) {
        this.emit('orientation-changed', orientation);
        this.unicon_panel_item._on_orientation_changed(orientation);
    },

    on_panel_height_changed: function() {
        this.unicon_panel_item.on_panel_height_changed();
        this.timer_section.panel_item.on_panel_height_changed();
        this.stopwatch_section.panel_item.on_panel_height_changed();
        this.pomodoro_section.panel_item.on_panel_height_changed();
        this.alarms_section.panel_item.on_panel_height_changed();
        this.todo_section.panel_item.on_panel_height_changed();
    }
};

function main(metadata, orientation, panel_height, instance_id) {
    let myApplet = new MyApplet(metadata, orientation, panel_height, instance_id);
    return myApplet;
}
