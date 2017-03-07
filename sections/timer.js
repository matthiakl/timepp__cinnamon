// global imports
const Clutter     = imports.gi.Clutter;
const St          = imports.gi.St;
const Lang        = imports.lang;
const PopupMenu   = imports.ui.popupMenu;
const GLib        = imports.gi.GLib;
const Gio         = imports.gi.Gio
const Pango       = imports.gi.Pango;
const MessageTray = imports.ui.messageTray;
const Mainloop    = imports.mainloop;
const Main        = imports.ui.main;
const Meta        = imports.gi.Meta;
const Settings    = imports.ui.settings;
const Signals     = imports.signals;


// local imports
const PANEL_ITEM    = imports.applet.lib.panel_item;
const ICON_FROM_URI = imports.applet.lib.icon_from_uri;
const NUM_PICKER    = imports.applet.lib.num_picker;
const MULTIL_ENTRY  = imports.applet.lib.multiline_entry;
const LPAD          = imports.applet.lib.leftpad;



const TIMER_CACHE_FILE = GLib.get_home_dir()+'/.cache/timepp_timer.json';
const TIMER_MAX_DURATION = 86400; // max num of seconds



function Timer(applet, settings, metadata, orientation) {
    this._init(applet, settings, metadata, orientation);
}

Timer.prototype = {
    _init: function (applet, settings, metadata, orientation) {
        try {
            this.section_name = 'Timer';

            this.applet        = applet;
            this.metadata      = metadata;


            // NOTE:
            // If the value in the setting is an array/obj, then each time we
            // change it, we must also fire the .save() method on it!
            // E.g., value.push(i); value.save();
            settings.bindWithObject(this, 'timer_key_open', 'key_open', this._toggle_keybinding);
            settings.bindWithObject(this, 'timer_icon', 'timer_icon', this._update_panel_icon_name);
            settings.bindWithObject(this, 'timer_separate_menu', 'separate_menu');
            settings.bindWithObject(this, 'timer_panel_mode', 'panel_mode', this._toggle_panel_mode);
            settings.bindWithObject(this, 'timer_show_secs', 'show_secs', this._update_time_display);


            // timer_state is one of: 'running' 'stopped' 'off'
            this.timer_state = 'off';
            this.timer_duration = 0; // in seconds


            //
            // add panel item
            //
            this.panel_item = new PANEL_ITEM.PanelItem(applet, metadata, orientation, _('Timer'));

            this.panel_item._set_label(this.show_secs ? '00:00:00' : '00:00');
            this.panel_item.actor.add_style_class_name('timer-panel-item off');
            this._update_panel_icon_name();
            this._toggle_panel_mode();

            applet.actor.add_actor(this.panel_item.actor);


            //
            // timer section
            //
            this.actor = new St.Bin({ style_class: 'section timer-section', x_fill: true });
            this.timer_pane = new PopupMenu.PopupMenuSection();
            this.actor.add_actor(this.timer_pane.actor);


            //
            // item with the time display, switcher and settings icon
            //
            this.header = new St.BoxLayout({style_class: 'timer-header popup-menu-item'});
            this.timer_pane.addActor(this.header);


            this.time_label = new St.Label({ text: _('Timer'), y_align: St.Align.END, x_align: St.Align.START, style_class: 'time-label' });
            this.header.add(this.time_label, {expand: true});

            this.option_box = new St.BoxLayout({y_align: Clutter.ActorAlign.CENTER, x_align: Clutter.ActorAlign.CENTER, style_class: 'timer-option-box'});
            this.header.add_actor(this.option_box);

            this.settings_icon = new St.Icon({icon_name: 'open-menu'});
            this.settings_bin  = new St.Button({ can_focus: true, y_align: St.Align.MIDDLE, x_align: St.Align.END, style_class: 'settings-icon'});
            this.settings_bin.add_actor(this.settings_icon);
            this.option_box.add(this.settings_bin);

            this.toggle     = new PopupMenu.Switch('');
            this.toggle_bin = new St.Button({y_align: St.Align.START, x_align: St.Align.END });
            this.toggle_bin.add_actor(this.toggle.actor);
            this.option_box.add(this.toggle_bin);

            this.toggle.actor.can_focus = false;
            this.toggle_bin.hide();


            //
            // timer slider
            //
            this.timer_slider_item = new PopupMenu.PopupSliderMenuItem(0);
            this.timer_pane.addMenuItem(this.timer_slider_item);


            //
            // settings window
            //
            this.timepicker_container = new St.Bin({x_fill: true});
            this.timer_pane.addActor(this.timepicker_container);


            //
            // listen
            //
            this.panel_item.connect('click', Lang.bind(this, function () {
                this.emit('open-menu');
            }));
            this.panel_item.connect('middle-click', Lang.bind(this, this._timer_toggle));
            this.toggle_bin.connect('clicked', Lang.bind(this, this._timer_toggle));
            this.settings_bin.connect('clicked', Lang.bind(this, this._show_settings));
            this.timer_slider_item.connect('value-changed', Lang.bind(this, this._slider_changed));
            this.timer_slider_item.connect('drag-end', Lang.bind(this, this._slider_released));
            this.timer_slider_item.actor.connect('scroll-event', Lang.bind(this, this._slider_released));


            //
            // load
            //
            this._load();
        } catch (e) {
            global.logError(e);
        }
    },

    _load: function () {
        // Using the built-in settings to cache various things seems to be rather
        // unreliable, so we store certain things manually into separate files.
        this.cache_file = Gio.file_new_for_path(TIMER_CACHE_FILE);

        if ( this.cache_file.query_exists(null) ) {
            let [a, contents, b] = this.cache_file.load_contents(null);
            this.cache = JSON.parse(contents);
        } else {
            this.cache = {
                enabled: true,
                notif_msg: '',
            };
        }

        this._toggle_keybinding();
    },

    _store_cache: function () {
        if (! this.cache_file.query_exists(null))
            this.cache_file.create(Gio.FileCreateFlags.NONE, null);

        this.cache_file.replace_contents(JSON.stringify(this.cache), null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    },

    _start: function () {
        this.toggle.setToggleState('checked');
        this.toggle_bin.show();
        this.toggle.actor.reactive  = true;
        this.toggle.actor.can_focus = true;
        this.timer_state = 'running';
        this._tic();
        this._panel_item_UI_update();
    },

    _stop: function () {
        this.toggle.setToggleState('');
        this.timer_state = 'stopped';
        this._panel_item_UI_update();
    },

    _off: function () {
        this.time_label.text = 'Timer';
        this.toggle_bin.hide();
        this.toggle.actor.reactive  = false;
        this.toggle.actor.can_focus = false;
        this.timer_state = 'off';
        this._panel_item_UI_update();
    },

    _expired: function () {
        this._send_notif();
        this._off();
    },

    _timer_toggle: function () {
        if (this.timer_state === 'stopped')
            this._start();
        else if (this.timer_state === 'running')
            this._stop();
        else
            return;

        this._panel_item_UI_update();
    },

    _panel_item_UI_update: function () {
        if (this.timer_state === 'running')
            this.panel_item.actor.remove_style_class_name('off');
        else
            this.panel_item.actor.add_style_class_name('off');
    },

    _tic: function () {
        // when a tic has been added to the mainloop, turn on the firewall in
        // order to prevent another tic from been added if the user changes the
        // slider while a tic is still sitting in the mainloop
        if (this.tic_firewall) return;
        if (this.timer_state === 'stopped' || this.timer_state === 'off') return;

        if (this.timer_duration < 1) {
            this._expired();
        }
        else {
            this.timer_duration -= 1;
            this._slider_update();
            this._update_time_display();
            this.tic_firewall = true;
            Mainloop.timeout_add_seconds(1, Lang.bind(this, function () {
                // the tic in the mainloop should go past the firewall
                this.tic_firewall = false;
                this._tic();
            }));
        }
    },

    _slider_released: function () {
        if (!this.timer_duration)
            this._off();
        else
            this._start();
    },

    _slider_changed: function (slider, value) {
        this._stop();

        if (value < 1) {
            // Make rate of change of the timer duration an exponential curve.
            // This allows for finer tuning when the duration is smaller.
            let y = (Math.pow(2, (10 * value)) - 1) / (Math.pow(2, 10) - 1);

            // Change the increment of the slider based on how far it's dragged.
            // If the seconds are not shown, the increments must be multiples
            // of 60s.
            let step;
            if (this.show_secs) {
                if      (value < .05) step = 15;
                else if (value < .5)  step = 30;
                else if (value < .8)  step = 60;
                else                  step = 3600;
            } else {
                if      (value < .7)  step = 59;
                else if (value < .9)  step = 1800;
                else                  step = 3600;
            }

            this.timer_duration = Math.floor(y * TIMER_MAX_DURATION / step) * step;
            this._update_time_display();
        } else {
            // fix for when the slider has been dragged past the limit
            this.timer_duration = TIMER_MAX_DURATION;
            this._update_time_display();
        }
    },

    _slider_update: function () {
        // Update slider based on the timer_duration.
        // Use this when the timer_duration changes without using the slider.
        // This function is the inverse of the function that is used to calc the
        // timer_duration based on the slider.
        let x = this.timer_duration / TIMER_MAX_DURATION;
        let y = (Math.log(x * (Math.pow(2, 10) - 1) +1)) / Math.log(2) / 10;
        this.timer_slider_item.setValue(y);
    },

    _update_time_display: function () {
        let str;

        // If the seconds are not shown, we need to make the timer '1-indexed'
        // in respect to minutes. I.e., 00:00:34 becomes 00:01.
        if (this.show_secs) {
            let time = this.timer_duration;

            let hr  = LPAD.lpad(Math.floor(time / 3600), 2);
            let min = LPAD.lpad(Math.floor(time % 3600 / 60), 2);
            let sec = LPAD.lpad((time % 60), 2);

            str = hr + ':' + min + ':' + sec;
        }
        else {
            let time = this.timer_duration;
            if (time % 3600 !== 0) time += 60;

            let hr  = LPAD.lpad(Math.floor(time / 3600), 2);
            let min = LPAD.lpad(Math.floor(time % 3600 / 60), 2);

            str = hr + ':' + min;
        }

        this.time_label.text = str;
        if (this.panel_item.label.visible) this.panel_item._set_label(str);
    },

    _send_notif: function () {
        // The source gets destroyed every time, so rebuild it.
        if (!this._source) {
            this._source = new MessageTray.Source();

            this._source.connect('destroy', Lang.bind(this, function() {
                this._source = null;
            }));

            if (Main.messageTray) Main.messageTray.add(this._source);
        }

        let icon = new St.Icon({icon_size: 32});
        ICON_FROM_URI.icon_from_uri(icon, this.timer_icon, this.metadata);

        this.notif = new TimerNotif(this._source, 'Timer expired!', null, { body: this.cache.notif_msg, customContent: true, icon: icon });
        this.notif.setUrgency(MessageTray.Urgency.CRITICAL);


        // fire notif
        this._source.notify(this.notif);
    },

    _show_settings: function () {
        let timepickers = new SettingsWindow(this.applet, this.show_secs, this.cache.notif_msg);
        this.timepicker_container.add_actor(timepickers.actor);
        timepickers.button_dismiss.grab_key_focus();

        this.header.hide();
        this.timer_slider_item.actor.hide();

        timepickers.connect('ok', Lang.bind(this, function (actor, time, notif_msg) {
            this.actor.grab_key_focus();
            timepickers.actor.destroy();
            this.header.show();
            this.timer_slider_item.actor.show();

            this.cache.notif_msg = notif_msg;
            this._store_cache();

            this.timer_duration = time;
            this._slider_update();
            this._start();
        }));

        timepickers.connect('dismiss', Lang.bind(this, function () {
            this.actor.grab_key_focus();
            timepickers.actor.destroy();
            this.header.show();
            this.timer_slider_item.actor.show();
        }));
    },

    _update_panel_icon_name: function() {
        ICON_FROM_URI.icon_from_uri(this.panel_item.icon, this.timer_icon, this.metadata);
        // If the path was relative the set_icon_name_from_path will convert to
        // absolute. We update the timer_icon in order to not have a broken
        // icon in the applet gtk settings window.
        this.timer_icon = this.panel_item.icon.get_gicon().to_string();
    },

    _toggle_panel_mode: function () {
        if (this.panel_mode === 0) this.panel_item._set_mode('icon');
        else if (this.panel_mode === 1) this.panel_item._set_mode('text');
        else this.panel_item._set_mode('icon_text');
    },

    // This method will be called by applet.js after the section has been enabled
    // or disabled.
    _toggle_section: function () {
        this._store_cache();
        if (! this.cache.enabled) this._stop();
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
        this._stop();
        if (this.key_id) Main.keybindingManager.removeHotKey(this.key_id);
    },
};
Signals.addSignalMethods(Timer.prototype);


/*
 * Settings window
 *
 * @applet: actual applet obj
 * @show_secs: bool
 * @notif_msg: string
 * signals: 'ok', 'dismiss'
 */
function SettingsWindow(applet, show_secs, notif_msg) {
    this._init(applet, show_secs, notif_msg);
}
SettingsWindow.prototype = {
    _init: function(applet, show_secs, notif_msg) {
        try {
            this.actor = new St.Bin({ x_fill: true, style_class: 'settings popup-menu-item' });

            this.content_box = new St.BoxLayout({ x_expand: true, vertical: true, style_class: 'settings-content-box menu-favorites-box' });
            this.actor.add_actor(this.content_box);


            //
            // time pickers
            //
            this.alarms_numpicker_box  = new St.BoxLayout({style_class: 'popup-menu-item numpicker-box'});
            this.content_box.add_actor(this.alarms_numpicker_box);

            this.hr_bin = new St.Bin({x_align: 1});
            this.alarms_numpicker_box.add(this.hr_bin, {expand: true});
            this.hr  = new NUM_PICKER.NumPicker(0, 23);
            this.hr_bin.add_actor(this.hr.actor);

            this.min_bin = new St.Bin({x_align: 1});
            this.alarms_numpicker_box.add(this.min_bin, {expand: true});
            this.min = new NUM_PICKER.NumPicker(0, 59);
            this.min_bin.add_actor(this.min.actor);

            if (show_secs) {
                this.sec_bin = new St.Bin({x_align: 1});
                this.alarms_numpicker_box.add(this.sec_bin, {expand: true});
                this.sec = new NUM_PICKER.NumPicker(0, 59);
                this.sec_bin.add_actor(this.sec.actor);
            }


            //
            // entry
            //
            this.entry_container = new St.BoxLayout({ vertical: true, style_class: 'popup-menu-item entry-container' });
            this.content_box.add_actor(this.entry_container);

            this.entry = new MULTIL_ENTRY.MultiLineEntry(_('Timer message...'), true);
            this.entry_container.add_actor(this.entry.actor);

            // Enable scrolling the entry by grabbing handle with mouse.
            let vscroll = this.entry.scroll_box.get_vscroll_bar();
            vscroll.connect('scroll-start', Lang.bind(this, function () { applet.menu.passEvents = true; }));
            vscroll.connect('scroll-stop', Lang.bind(this, function () { applet.menu.passEvents = false; }));

            // fill entry with notif_msg
            Meta.later_add(Meta.LaterType.BEFORE_REDRAW, Lang.bind(this, function() {
                this.entry.entry.set_text(notif_msg);
            }));

            Meta.later_add(Meta.LaterType.BEFORE_REDRAW, Lang.bind(this, function() {
                this.entry._resize_entry();
            }));


            //
            // buttons
            //
            let alarms_settings_btn_box = new St.Widget({ style_class: 'popup-menu-item btn-box', layout_manager: new Clutter.BoxLayout ({ homogeneous:true }) });
            this.content_box.add_actor(alarms_settings_btn_box);

            this.button_dismiss = new St.Button({ can_focus: true, label: 'Dismiss', style_class: 'button notification-icon-button modal-dialog-button', x_expand: true });
            this.button_ok      = new St.Button({ can_focus: true, label: 'Ok', style_class: 'button notification-icon-button modal-dialog-button', x_expand: true });
            alarms_settings_btn_box.add_actor(this.button_dismiss);
            alarms_settings_btn_box.add_actor(this.button_ok);


            //
            // listen
            //
            this.button_ok.connect('clicked', Lang.bind(this, function () {
                this.emit('ok', this._get_time(), this.entry.entry.get_text());
            }));

            this.button_dismiss.connect('clicked', Lang.bind(this, function () {
                this.emit('dismiss');
            }));
        } catch(e) {
            global.logError(e);
        }
    },

    _get_time: function () {
        let hr  = parseInt(this.hr.counter.text) * 3600;
        let min = parseInt(this.min.counter.text) * 60;
        let sec = this.sec ? parseInt(this.sec.counter.text) : 0;

        return hr + min + sec;
    },
}
Signals.addSignalMethods(SettingsWindow.prototype);



/*
 * Alarm Notification
 *
 * We need to override the addBody method in order to have full pango markup.
 */
function TimerNotif (source, title, banner, params) {
   this._init(source, title, banner, params);
};
TimerNotif.prototype = {
    __proto__: MessageTray.Notification.prototype,

   _init: function(source, title, banner, params) {
      MessageTray.Notification.prototype._init.call(this, source, title, banner, params);
   },

    // override the default addBody to allow for full pango markup
    addBody: function(text, markup, style) {
        let label = new St.Label({text: text});
        this.addActor(label);

        label.clutter_text.set_single_line_mode(false);
        label.clutter_text.set_line_wrap(true);
        label.clutter_text.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        label.clutter_text.use_markup = true;

        return label;
    }
}
