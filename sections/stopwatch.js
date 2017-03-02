// global imports
const Clutter   = imports.gi.Clutter;
const St        = imports.gi.St;
const PopupMenu = imports.ui.popupMenu;
const Lang      = imports.lang;
const GLib      = imports.gi.GLib;
const Gio       = imports.gi.Gio
const Mainloop  = imports.mainloop;
const Main      = imports.ui.main;
const Settings  = imports.ui.settings;
const Signals   = imports.signals;


// local imports
const PANEL_ITEM    = imports.applet.lib.panel_item;
const ICON_FROM_URI = imports.applet.lib.icon_from_uri;
const LPAD          = imports.applet.lib.leftpad;


const STOPWATCH_CACHE_FILE = GLib.get_home_dir() + '/.cache/timepp_stopwatch.json';


// 'cache.state' is one of:
//   - 'running'
//   - 'paused'
//   - 'reset'


function Stopwatch(applet, settings, metadata, instance_id, orientation) {
    this._init(applet, settings, metadata, instance_id, orientation);
}

Stopwatch.prototype = {
    _init: function (applet, settings, metadata, instance_id, orientation) {
        try {
            this.section_name = 'Stopwatch';


            this.applet   = applet;
            this.metadata = metadata;


            // NOTE:
            // If the value in the setting is an array/obj, then each time we
            // change it, we must also fire the .save() method on it!
            // E.g., value.push(i); value.save();
            settings.bindWithObject(this, 'stopwatch_key_open', 'key_open', this._toggle_keybinding);
            settings.bindWithObject(this, 'stopwatch_icon', 'stopwatch_icon', this._update_panel_icon_name);
            settings.bindWithObject(this, 'stopwatch_separate_menu', 'separate_menu');
            settings.bindWithObject(this, 'stopwatch_panel_mode', 'panel_mode', this._toggle_panel_mode);
            settings.bindWithObject(this, 'stopwatch_show_secs', 'show_secs', this._update_time_display);


            //
            // panel item
            //
            this.panel_item = new PANEL_ITEM.PanelItem(applet, metadata, orientation, _('Stopwatch'));

            this.panel_item._set_label(this.show_secs ? '00:00:00' : '00:00');
            this.panel_item.actor.add_style_class_name('stopwatch-panel-item off');
            this._update_panel_icon_name();
            this._toggle_panel_mode();

            applet.actor.add_actor(this.panel_item.actor);



            //
            // stopwatch box
            //
            this.actor = new St.Bin({ style_class: 'section stopwatch-section', x_fill: true });
            this.stopwatch_pane = new PopupMenu.PopupMenuSection();
            this.actor.add_actor(this.stopwatch_pane.actor);


            //
            // timer label
            //
            this.time_display = new PopupMenu.PopupMenuItem(_('Stopwatch'), {reactive: false, style_class: 'time-label'});
            this.stopwatch_pane.addMenuItem(this.time_display);


            //
            // buttons
            //
            this.stopwatch_button_box = new St.Widget({ style_class: 'popup-menu-item btn-box', layout_manager: new Clutter.BoxLayout ({ homogeneous: true }) });
            this.stopwatch_pane.addActor(this.stopwatch_button_box);

            this.button_reset = new St.Button({ can_focus: true, label: _('Reset'), style_class: 'button notification-icon-button modal-dialog-button btn-reset', x_expand: true, visible: false });
            this.button_lap   = new St.Button({ can_focus: true, label: _('Lap'),   style_class: 'button notification-icon-button modal-dialog-button btn-lap',   x_expand: true, visible: false });
            this.button_start = new St.Button({ can_focus: true, label: _('Start'), style_class: 'button notification-icon-button modal-dialog-button btn-start', x_expand: true });
            this.button_pause = new St.Button({ can_focus: true, label: _('Pause'), style_class: 'button notification-icon-button modal-dialog-button btn-stop',  x_expand: true, visible: false });
            this.stopwatch_button_box.add_actor(this.button_reset);
            this.stopwatch_button_box.add_actor(this.button_lap);
            this.stopwatch_button_box.add_actor(this.button_start);
            this.stopwatch_button_box.add_actor(this.button_pause);



            //
            // laps box
            //
            this.laps_scroll = new St.ScrollView({ visible: false, style_class: 'laps-scrollview', x_fill: true, y_fill: false, y_align: St.Align.START});
            this.stopwatch_pane.addActor(this.laps_scroll);

            // enable scrolling by grabbing with the mouse
            // requires that the 'passEvent' bool inside the top menu is disabled
            // the top menu is passed as parameter on object creation
            let vscroll = this.laps_scroll.get_vscroll_bar();
            vscroll.connect('scroll-start', Lang.bind(this, function () { applet.menu.passEvents = true; }));
            vscroll.connect('scroll-stop', Lang.bind(this, function () { applet.menu.passEvents = false; }));

            this.laps_section = new PopupMenu.PopupMenuSection();
            this.laps_scroll.add_actor(this.laps_section.actor);


            //
            // listen
            //
            this.panel_item.connect('click', Lang.bind(this, function () {
                this.emit('open-menu');
            }));
            this.panel_item.connect('middle-click', Lang.bind(this, this._stopwatch_toggle));
            this.button_start.connect('clicked', Lang.bind(this, this._start));
            this.button_reset.connect('clicked', Lang.bind(this, this._reset));
            this.button_pause.connect('clicked', Lang.bind(this, this._pause));
            this.button_lap.connect('clicked', Lang.bind(this, this._lap));


            //
            // load
            //
            this._load();
       } catch(e) {
            global.logError(e);
        }
    },

    _load: function () {
        // Using the built-in settings to cache various things seems to be rather
        // unreliable, so we store certain things manually into separate files.
        this.lap_count = 0;

        this.cache_file = Gio.file_new_for_path(STOPWATCH_CACHE_FILE);

        if ( this.cache_file.query_exists(null) ) {
            let [a, contents, b] = this.cache_file.load_contents(null);
            this.cache = JSON.parse(contents);
        } else {
            this.cache = {
                enabled: true,
                state:   'reset',
                time:    0,
                laps:    [],
            };
        }


        this._toggle_keybinding();

        if (this.cache.state === 'reset') return;


        for (i = 0; i < this.cache.laps.length; i++)
            this._lap(this.cache.laps[i]);

        this._update_time_display();

        if (this.cache.state === 'running')
            this._start();
        else
            this._pause();
    },

    _store_cache: function () {
        if (! this.cache_file.query_exists(null))
            this.cache_file.create(Gio.FileCreateFlags.NONE, null);

        this.cache_file.replace_contents(JSON.stringify(this.cache), null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    },

    _start: function (actor, event) {
        this.button_pause.grab_key_focus();

        this.cache.state = 'running';
        this._store_cache();
        this._periodic_time_backup();
        this._toggle_buttons();
        this._panel_item_UI_update();
        this._tic();
    },

    _pause: function (actor, event) {
        this.button_start.grab_key_focus();

        this.cache.state = 'paused';
        this._store_cache();
        this._panel_item_UI_update();
        this._toggle_buttons();
    },

    _reset: function (actor, event) {
        this.button_start.grab_key_focus();

        this.cache.state = 'reset';
        this.cache.laps = [];
        this.cache.time = 0;
        this._store_cache();
        this.lap_count = 0;
        this.panel_item._set_label(this.show_secs ? '00:00:00' : '00:00');

        this._toggle_buttons();
        this._panel_item_UI_update();
        this._destroy_laps();
        this.time_display.label.text = 'Stopwatch';
    },

    _stopwatch_toggle: function () {
        if (this.cache.state === 'running')
            this._pause();
        else
            this._start();
    },

    _update_time_display: function () {
        let hr  = LPAD.lpad(Math.floor(this.cache.time / 3600), 2);
        let min = LPAD.lpad(Math.floor(this.cache.time % 3600 / 60), 2);
        let sec = LPAD.lpad((this.cache.time % 60), 2);

        let str =  hr + ':' + min + (this.show_secs ? (':' + sec) : '');

        this.time_display.label.text = str;
        if (this.panel_item.label.visible) this.panel_item._set_label(str);
    },

    _panel_item_UI_update: function () {
        if (this.cache.state === 'running')
            this.panel_item.actor.remove_style_class_name('off');
        else
            this.panel_item.actor.add_style_class_name('off');
    },

    _lap: function (lap_time) {
        this.laps_scroll.show();

        this.lap_count += 1;

        let lap = new St.BoxLayout({style_class: 'laps-item'});
        this.laps_section.actor.add_actor(lap);

        let lap_count = new St.Label({text: this.lap_count + ': ', style_class: 'laps-item-counter'});
        lap.add_actor(lap_count);

        if (typeof(lap_time) !== 'string') {
            let hr  = LPAD.lpad(Math.floor(this.cache.time / 3600), 2);
            let min = LPAD.lpad(Math.floor(this.cache.time % 3600 / 60), 2);
            let sec = LPAD.lpad((this.cache.time % 60), 2);

            let str =  hr + ':' + min + ':' + sec;

            lap_time = new St.Label({text: str, style_class: 'laps-item-time'});

            this.cache.laps.push(str);
            this.cache.time = this.cache.time;
            this._store_cache();
        }
        else {
            lap_time = new St.Label({text: String(lap_time), style_class: 'laps-item-time'});
        }

        lap.add_actor(lap_time);
    },

    _destroy_laps: function () {
        this.laps_scroll.hide();

        this.laps_section.destroy();
        this.laps_section = new PopupMenu.PopupMenuSection();
        this.laps_scroll.add_actor(this.laps_section.actor);
    },

    _toggle_buttons: function () {
        if (this.cache.state === 'reset') {
            this.button_reset.hide();
            this.button_lap.hide();
            this.button_start.show();
            this.button_pause.hide();
            this.button_start.add_style_pseudo_class('first-child');
            this.button_start.add_style_pseudo_class('last-child');
        } else if (this.cache.state === 'running') {
            this.button_reset.show();
            this.button_lap.show();
            this.button_start.hide();
            this.button_pause.show();
        } else {
            this.button_reset.show();
            this.button_lap.hide();
            this.button_start.show();
            this.button_pause.hide();
            this.button_start.remove_style_pseudo_class('first-child');
            this.button_start.add_style_pseudo_class('last-child');
        }
    },

    _tic: function () {
        // When a tic has been added to the mainloop, turn on the firewall in
        // order to prevent another tic from been added.
        if (this.tic_firewall) return;

        let state = this.cache.state;
        if (state === 'paused' || state === 'reset') return;

        this.cache.time += 1;
        this._update_time_display();

        this.tic_firewall = true;

        Mainloop.timeout_add_seconds(1, Lang.bind(this, function () {
            // the tic in the mainloop should go past the firewall
            this.tic_firewall = false;
            this._tic();
        }));
    },

    // this function backs the current time every period seconds
    _periodic_time_backup: function () {
        if (this.time_backup_flag) return;
        this.time_backup_flag = true;

        this.cache.time = this.cache.time;
        this._store_cache();

        Mainloop.timeout_add_seconds(60, Lang.bind(this, function () {
            this.time_backup_flag = false;

            if (this.cache.state === 'running')
                this._periodic_time_backup();
        }));
    },

    _update_panel_icon_name: function() {
        ICON_FROM_URI.icon_from_uri(this.panel_item.icon, this.stopwatch_icon, this.metadata);
        // If the path was relative the set_icon_name_from_path will convert to
        // absolute. We update the timer_icon in order to not have a broken
        // icon in the applet gtk settings window.
        this.stopwatch_icon = this.panel_item.icon.get_gicon().to_string();
    },

    _toggle_panel_mode: function () {
        if (this.panel_mode === 0) this.panel_item._set_mode('icon');
        else if (this.panel_mode === 1) this.panel_item._set_mode('text');
        else this.panel_item._set_mode('icon_text');
    },

    // This method will be called by applet.js when the section is enabled
    // or disabled.
    _toggle_section: function () {
        if (! this.cache.enabled) {
            this.cache.state = 'paused';
            this._panel_item_UI_update();
            this._toggle_buttons();
        }

        this._store_cache();
        this._toggle_keybinding();
    },

    _toggle_keybinding: function () {
        if (this.cache.enabled) {
            if (this.key_id) Main.keybindingManager.removeHotKey(this.key_id);

            if (this.open_key !== '') {
                this.key_id = this.section_name;
                Main.keybindingManager.addHotKey(this.key_id, this.key_open, Lang.bind(this, function () {
                    this.applet._open_menu(this);
                }));
            }
        }
        else
            if (this.key_id) Main.keybindingManager.removeHotKey(this.key_id);
    },

    _on_applet_removed_from_panel: function () {
        this.cache.time = this.cache.time;
        this._store_cache();
        this.cache.state = 'paused';
        if (this.key_id) Main.keybindingManager.removeHotKey(this.key_id);
    },
}
Signals.addSignalMethods(Stopwatch.prototype);
