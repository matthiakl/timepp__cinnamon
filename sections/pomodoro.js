const St          = imports.gi.St;
const Gio         = imports.gi.Gio
const GLib        = imports.gi.GLib;
const Clutter     = imports.gi.Clutter;
const MessageTray = imports.ui.messageTray;
const Main        = imports.ui.main;
const CheckBox    = imports.ui.checkBox;
const Settings    = imports.ui.settings;
const PopupMenu   = imports.ui.popupMenu;
const Util        = imports.misc.util;
const Mainloop    = imports.mainloop;
const Signals     = imports.signals;
const Lang        = imports.lang;


const PANEL_ITEM    = imports.applet.lib.panel_item;
const ICON_FROM_URI = imports.applet.lib.icon_from_uri;
const NUM_PICKER    = imports.applet.lib.num_picker;
const LPAD          = imports.applet.lib.leftpad;


const CACHE_FILE = GLib.get_home_dir() + '/.cache/timepp_pomodoro.json';


const PomoPhase = {
    POMO        : 'POMO',
    SHORT_BREAK : 'SHORT_BREAK',
    LONG_BREAK  : 'LONG_BREAK',
};


//
// time_str: string representing time in hh:mm 24h format. E.g., '13:44'.
//


// =====================================================================
// @@@ Main
// =====================================================================
function Pomodoro(applet, settings, metadata, instance_id, orientation) {
    this._init(applet, settings, metadata, instance_id, orientation);
};

Pomodoro.prototype = {
    _init: function(applet, settings, metadata, instance_id, orientation) {
        this.section_name = 'Pomodoro';


        this.applet        = applet;
        this.metadata      = metadata;
        this.orientation   = orientation;


        // NOTE:
        // If the value in the setting is an array/obj, then each time we
        // change it, we must also fire the .save() method on it!
        // E.g., value.push(i); value.save();
        settings.bindWithObject(this, 'pomo_key_open', 'key_open', this._toggle_keybinding);
        settings.bindWithObject(this, 'pomo_icon', 'pomodoro_icon', this._update_panel_icon_name);
        settings.bindWithObject(this, 'pomo_separate_menu', 'separate_menu');
        settings.bindWithObject(this, 'pomo_panel_mode', 'panel_mode', this._toggle_panel_mode);
        settings.bindWithObject(this, 'pomo_show_secs', 'show_secs', this._update_time_display);
        settings.bindWithObject(this, 'pomo_stop_time_tracking', 'stop_time_tracking');
        settings.bindWithObject(this, 'pomo_script_path', 'script_path');


        this.pomo_phase     = PomoPhase.POMO;
        this.timer_state    = false;
        this.timer_duration = 0;


        //
        // add panel item
        //
        this.panel_item = new PANEL_ITEM.PanelItem(applet, metadata, orientation, _('Pomodoro'));

        this.panel_item.set_label(this.show_secs ? '00:00:00' : '00:00');
        this.panel_item.actor.add_style_class_name('pomo-panel-item');
        this._update_panel_icon_name();
        this._update_time_display();
        this._toggle_panel_mode();

        applet.actor.add_actor(this.panel_item.actor);


        //
        // pomodoro pane
        //
        this.actor = new St.Bin({ x_fill: true, style_class: 'section pomo-section' });

        this.pomodoro_pane = new PopupMenu.PopupMenuSection();
        this.actor.add_actor(this.pomodoro_pane.actor);


        //
        // start pomodoro item
        //
        this.pomodoro_time_display_item = new St.BoxLayout({x_expand: true, style_class: 'popup-menu-item'});
        this.pomodoro_pane.addActor(this.pomodoro_time_display_item);


        //
        // label and timer display
        //
        this.label = new St.Label({ y_align: Clutter.ActorAlign.CENTER, style_class: 'time-label' });
        this.pomodoro_time_display_item.add_actor(this.label);


        //
        // pomo counter
        //
        this.pomo_counter_display = new St.Label({ x_align: Clutter.ActorAlign.END, y_align: Clutter.ActorAlign.CENTER, style_class: 'pomo-counter' });
        this.pomodoro_time_display_item.add(this.pomo_counter_display, {expand: true});


        //
        // settings icon
        //
        this.icon_bin = new St.Button({ can_focus: true, x_align: St.Align.END, y_align: St.Align.MIDDLE, style_class: 'settings-icon' });
        this.pomodoro_time_display_item.add(this.icon_bin);

        this.settings_icon = new St.Icon({icon_name: 'open-menu'});
        this.icon_bin.add_actor(this.settings_icon);


        //
        // buttons
        //
        this.button_box = new St.BoxLayout({ style_class: 'popup-menu-item btn-box' });
        this.pomodoro_pane.addActor(this.button_box);

        this.button_new_pomo = new St.Button({can_focus:  true, label: _('New Pomo'), x_expand: true, visible: false, style_class: 'button notification-icon-button modal-dialog-button btn-new'});
        this.button_take_break = new St.Button({can_focus: true, label: _('Take Break'), x_expand: true, visible: false, style_class: 'button notification-icon-button modal-dialog-button btn-break'});
        this.button_start = new St.Button({can_focus: true, label: _('Start'), x_expand: true, style_class: 'button notification-icon-button modal-dialog-button btn-start'});
        this.button_stop = new St.Button({can_focus: true, label: _('Stop'), x_expand: true, visible: false, style_class: 'button notification-icon-button modal-dialog-button btn-stop'});

        this.button_box.add(this.button_new_pomo, {expand: true});
        this.button_box.add(this.button_take_break, {expand: true});
        this.button_box.add(this.button_start, {expand: true});
        this.button_box.add(this.button_stop, {expand: true});


        //
        // settings container
        //
        this.settings_container = new St.Bin({x_fill: true});
        this.pomodoro_pane.addActor(this.settings_container);


        //
        // listen
        //
        this.panel_item.connect('click', Lang.bind(this, function () {
            this.emit('toggle-menu');
        }));
        this.panel_item.connect('middle-click', Lang.bind(this, this._timer_toggle));
        this.icon_bin.connect('clicked', Lang.bind(this, this._show_settings));
        this.button_start.connect('clicked', Lang.bind(this, this._start));
        this.button_stop.connect('clicked', Lang.bind(this, this._stop));
        this.button_new_pomo.connect('clicked', Lang.bind(this, this._start_new_pomo));
        this.button_take_break.connect('clicked', Lang.bind(this, this._take_break));


        //
        // load
        //
        this._load();
    },

    _load: function () {
        // Using the built-in settings to cache various things seems to be rather
        // unreliable, so we store certain things manually into separate files.
        this._lap_count = 0;

        this.cache_file = Gio.file_new_for_path(CACHE_FILE);

        if ( this.cache_file.query_exists(null) ) {
            let [a, contents, b] = this.cache_file.load_contents(null);
            this.cache = JSON.parse(contents);
        }
        else {
            this.cache = {
                enabled         : true,
                pomo_counter    : 0,
                pomo_duration   : 1500,
                short_break     : 300,
                long_break      : 900,
                long_break_rate : 4,
            };
        }

        let count_str = String(this.cache.pomo_counter);
        this.pomo_counter_display.text = this.cache.pomo_counter ? count_str : '';
        this.timer_duration = this.cache.pomo_duration;

        this._toggle_keybinding();
        this._update_time_display();
        this.label.set_text(_('Pomodoro'));
    },

    _store_cache: function () {
        if (! this.cache_file.query_exists(null))
            this.cache_file.create(Gio.FileCreateFlags.NONE, null);

        this.cache_file.replace_contents(JSON.stringify(this.cache), null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    },

    _show_settings: function () {
        let settings = new PomodoroSettings(this.cache);
        this.settings_container.add_actor(settings.actor);
        settings.button_cancel.grab_key_focus();

        this.pomodoro_time_display_item.hide();
        this.button_box.hide();

        settings.connect('ok', Lang.bind(this, function (actor, clear_pomo_counter) {
            this._store_cache();

            if (! this.timer_state)
                this.timer_duration = this.cache.pomo_duration;

            if (clear_pomo_counter) {
                this.cache.pomo_counter = 0;
                this._store_cache();
                this.pomo_counter_display.text = '';
            }

            this.button_box.show();
            this.button_box.grab_key_focus();
            settings.actor.destroy();
            this.pomodoro_time_display_item.show();
            this._update_time_display();
        }));

        settings.connect('cancel', Lang.bind(this, function () {
            this.button_box.show();
            this.actor.grab_key_focus();
            settings.actor.destroy();
            this.pomodoro_time_display_item.show();
        }));
    },

    _exec_custom_script: function () {
        if (this.script_path) {
            Util.spawnCommandLine(this.script_path.replace(/^.+?\/\//, '') +
                                  " " + this.pomo_phase);
        }
    },

    _start: function () {
        this.button_stop.grab_key_focus();
        this.timer_state = true;
        this.pomo_phase  = PomoPhase.POMO;
        this._toggle_buttons();
        this._panel_item_UI_update();
        this._tic();
        this._exec_custom_script();
    },

    _stop: function () {
        this.button_start.grab_key_focus();
        this.timer_state = false;
        this._toggle_buttons();
        this._panel_item_UI_update();
        if (this.stop_time_tracking) this.emit('stop-time-tracking');
    },

    _start_new_pomo: function () {
        this.timer_state    = true;
        this.timer_duration = this.cache.pomo_duration;
        this.pomo_phase     = PomoPhase.POMO;
        this._toggle_buttons();
        this._panel_item_UI_update();
        this._tic();
        this._exec_custom_script();
    },

    _take_break: function () {
        if (this.cache.pomo_counter &&
            ((this.cache.pomo_counter % this.cache.long_break_rate) === 0)) {

            this.pomo_phase     = PomoPhase.LONG_BREAK;
            this.timer_duration = this.cache.long_break;
            this._exec_custom_script();
        }
        else {
            this.pomo_phase     = PomoPhase.SHORT_BREAK;
            this.timer_duration = this.cache.short_break;
            this._exec_custom_script();
        }

        this.timer_state = true;
        this._toggle_buttons();
        this._panel_item_UI_update();
        this._tic();
        if (this.stop_time_tracking) this.emit('stop-time-tracking');
    },

    _timer_toggle: function () {
        if (this.timer_state)
            this._stop();
        else
            this._start();
    },

    _panel_item_UI_update: function () {
        if (this.timer_state)
            this.panel_item.actor.add_style_class_name('on');
        else
            this.panel_item.actor.remove_style_class_name('on');
    },

    _toggle_buttons: function () {
        this.button_new_pomo.show();

        if (this.timer_state) {
            this.button_start.hide();
            this.button_stop.show();
        } else {
            this.button_start.show();
            this.button_stop.hide();
        }

        if (this.pomo_phase === PomoPhase.POMO) {
            this.button_take_break.show();
        }
        else {
            this.button_take_break.hide();
        }
    },

    _timer_expired: function () {
        if (this.pomo_phase === PomoPhase.LONG_BREAK || this.pomo_phase === PomoPhase.LONG_BREAK) {
            this._start_new_pomo();
            this._send_notif();
        } else {
            this.cache.pomo_counter += 1;
            this._store_cache();
            this._take_break();
            this._send_notif();
            this.pomo_counter_display.text = String(this.cache.pomo_counter);
        }
    },

    _tic: function () {
        // when a tic has been added to the mainloop, turn on the firewall in
        // order to prevent another tic from been added if the user changes the
        // slider while a tic is still sitting in the mainloop
        if (this.tic_firewall || (! this.timer_state) ) return;

        if (this.timer_duration < 1) {
            this._timer_expired();
        }
        else {
            this.timer_duration -= 1;
            this._update_time_display();
            this.tic_firewall = true;
            Mainloop.timeout_add_seconds(1, Lang.bind(this, function () {
                // the tic in the mainloop should go past the firewall
                this.tic_firewall = false;
                this._tic();
            }));
        }
    },

    _update_time_display: function () {
        let str;

        // If the seconds are not shown, we need to make the timer '1-indexed'
        // with respect to minutes. I.e., 00:00:34 becomes 00:01.
        if (this.show_secs) {
            let time = this.timer_duration;

            let hr  = LPAD.lpad(Math.floor(time / 3600), 2);
            let min = LPAD.lpad(Math.floor(time % 3600 / 60), 2);
            let sec = LPAD.lpad((time % 60), 2);

            str = hr + ':' + min + ':' + sec;
        }
        else {
            let time = this.timer_duration;

            if (time !== 0 && time !== this.cache.pomo_duration)
                time += 60;

            let hr  = LPAD.lpad(Math.floor(time / 3600), 2);
            let min = LPAD.lpad(Math.floor(time % 3600 / 60), 2);

            str = hr + ':' + min;
        }

        if (this.label) this.label.text = str;
        if (this.panel_item.label.visible) this.panel_item.set_label(str);
    },

    _send_notif: function () {
        switch (this.pomo_phase) {
            case PomoPhase.POMO:       msg = _('Start working!');      break;
            case PomoPhase.LONG_BREAK: msg = _('Take a short break!'); break;
            case PomoPhase.LONG_BREAK: msg = _('Take long break!');    break;
            default: return;
        }

        // The source gets destroyed every time, so rebuild it.
        if (!this._source) {
            this._source = new MessageTray.Source();

            this._source.connect('destroy', Lang.bind(this, function() {
                this._source = null;
            }));

            if (Main.messageTray) Main.messageTray.add(this._source);
        }

        let alarm_icon = new St.Icon({icon_size: 32});
        ICON_FROM_URI.icon_from_uri(alarm_icon, this.pomodoro_icon, this.metadata);

        this.notif = new MessageTray.Notification(this._source, msg, null, { icon: alarm_icon });
        this.notif.setUrgency(MessageTray.Urgency.HIGH);

        // fire notif
        this._source.notify(this.notif);
    },

    _update_panel_icon_name: function() {
        ICON_FROM_URI.icon_from_uri(this.panel_item.icon, this.pomodoro_icon, this.metadata);
        // If the path was relative the set_icon_name_from_path will convert to
        // absolute. We update the timer_icon in order to not have a broken
        // icon in the applet gtk settings window.
        this.pomodoro_icon = this.panel_item.icon.get_gicon().to_string();
    },

    _toggle_panel_mode: function () {
        if (this.panel_mode === 0) this.panel_item.set_mode('icon');
        else if (this.panel_mode === 1) this.panel_item.set_mode('text');
        else this.panel_item.set_mode('icon_text');
    },

    // This method will be called by applet.js when the section is enabled
    // or disabled.
    toggle_section: function () {
        this._store_cache();

        if (! this.cache.enabled) {
            this.timer_state = false;
            this._toggle_buttons();
            this._panel_item_UI_update();
        }

        this._toggle_keybinding();
    },

    _toggle_keybinding: function () {
        if (this.cache.enabled) {
            if (this.key_id) Main.keybindingManager.removeHotKey(this.key_id);

            if (this.open_key !== '') {
                this.key_id = this.section_name;
                Main.keybindingManager.addHotKey(this.key_id, this.key_open, Lang.bind(this, function () {
                    this.applet.open_menu(this);
                }));
            }
        }
        else
            if (this.key_id) Main.keybindingManager.removeHotKey(this.key_id);
    },

    on_applet_removed_from_panel: function () {
        this.timer_state = false;
        if (this.key_id) Main.keybindingManager.removeHotKey(this.key_id);
    },
}
Signals.addSignalMethods(Pomodoro.prototype);



// =====================================================================
// @@@ Pomodoro settings
//
// @signals: 'ok', 'cancel'
// =====================================================================
function PomodoroSettings(pomo_cache) {
    this._init(pomo_cache);
};

PomodoroSettings.prototype = {
    _init: function(pomo_cache) {
        this.actor = new St.BoxLayout({style_class: 'view-box popup-menu-item'});

        this.content_box = new St.BoxLayout({vertical: true, style_class: 'view-box-content menu-favorites-box'});
        this.actor.add(this.content_box, {expand: true});


        //
        // clear all pomodoros
        //
        this.clear_all_item = new St.BoxLayout({style_class: 'popup-menu-item settings-item'});
        this.content_box.add_actor(this.clear_all_item);

        this.clear_item_label = new St.Label({text: _('Clear all pomodoros?'), y_align: St.Align.END});
        this.clear_all_item.add_actor(this.clear_item_label);

        this.clear_checkbox_bin = new St.Bin({x_align: St.Align.END});
        this.clear_all_item.add(this.clear_checkbox_bin, {expand: true});

        this.clear_item_checkbox = new CheckBox.CheckButton();
        this.clear_checkbox_bin.add_actor(this.clear_item_checkbox.actor);


        //
        // pomodoro duration
        //
        this.pomo_duration = new St.BoxLayout({style_class: 'popup-menu-item settings-item'});
        this.content_box.add_actor(this.pomo_duration);

        this.pomo_label = new St.Label({text: _('Pomodoro (min):'), y_align: Clutter.ActorAlign.CENTER});
        this.pomo_duration.add(this.pomo_label, {expand: true});

        this.pomo_dur_mm_picker = new NUM_PICKER.NumPicker(1, null);
        this.pomo_duration.add_actor(this.pomo_dur_mm_picker.actor);

        this.pomo_dur_mm_picker._set_counter(Math.floor(pomo_cache.pomo_duration / 60));


        //
        // short break
        //
        this.short_break = new St.BoxLayout({style_class: 'popup-menu-item settings-item'});
        this.content_box.add_actor(this.short_break);

        this.short_break_label = new St.Label({text: _('Short break (min):'), y_align: Clutter.ActorAlign.CENTER});
        this.short_break.add(this.short_break_label, {expand: true});

        this.short_break_mm_picker = new NUM_PICKER.NumPicker(1, null);
        this.short_break.add_actor(this.short_break_mm_picker.actor);

        this.short_break_mm_picker._set_counter(Math.floor(pomo_cache.short_break / 60));


        //
        // long break
        //
        this.long_break = new St.BoxLayout({style_class: 'popup-menu-item settings-item'});
        this.content_box.add_actor(this.long_break);

        this.long_break_label = new St.Label({text: _('Long break (min):'), y_align: Clutter.ActorAlign.CENTER});
        this.long_break.add(this.long_break_label, {expand: true});

        this.long_break_mm_picker = new NUM_PICKER.NumPicker(1, null);
        this.long_break.add_actor(this.long_break_mm_picker.actor);

        this.long_break_mm_picker._set_counter(Math.floor(pomo_cache.long_break / 60));


        //
        // how many pomodoros 'till long break
        //
        this.long_break_rate = new St.BoxLayout({style_class: 'popup-menu-item settings-item'});
        this.content_box.add_actor(this.long_break_rate);

        this.long_break_rate_label = new St.Label({text: _('Num of pomos until long break:'), y_align: Clutter.ActorAlign.CENTER});
        this.long_break_rate.add(this.long_break_rate_label, {expand: true});

        this.long_break_rate_picker = new NUM_PICKER.NumPicker(1, null);
        this.long_break_rate.add_actor(this.long_break_rate_picker.actor);

        this.long_break_rate_picker._set_counter(pomo_cache.long_break_rate);


        //
        // buttons
        //
        this.button_box = new St.BoxLayout({ style_class: 'popup-menu-item settings-item' });
        this.content_box.add(this.button_box, {expand: true});

        this.button_ok      = new St.Button({can_focus: true, label: _('Ok'), y_expand: true, x_expand: true, style_class: 'button notification-icon-button modal-dialog-button'});
        this.button_cancel = new St.Button({can_focus: true, label: _('Cancel'), y_expand: true, x_expand: true, style_class: 'button notification-icon-button modal-dialog-button'});

        this.button_box.add(this.button_cancel, {expand: true});
        this.button_box.add(this.button_ok, {expand: true});


        //
        // listen
        //
        this.button_ok.connect('clicked', Lang.bind(this, function() {
            pomo_cache.pomo_duration   = this.pomo_dur_mm_picker.counter * 60;
            pomo_cache.short_break     = this.short_break_mm_picker.counter * 60;
            pomo_cache.long_break      = this.long_break_mm_picker.counter * 60;
            pomo_cache.long_break_rate = this.long_break_rate_picker.counter;

            this.emit('ok', this.clear_item_checkbox.actor.checked);
        }));

        this.button_cancel.connect('clicked', Lang.bind(this, function () {
        this.emit('cancel');
        }));
    },
}
Signals.addSignalMethods(PomodoroSettings.prototype);
