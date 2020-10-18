// global imports
const St          = imports.gi.St;
const Clutter     = imports.gi.Clutter;
const Lang        = imports.lang;
const PopupMenu   = imports.ui.popupMenu;
const Pango       = imports.gi.Pango;
const GLib        = imports.gi.GLib;
const Gio         = imports.gi.Gio
const MessageTray = imports.ui.messageTray;
const Meta        = imports.gi.Meta;
const Mainloop    = imports.mainloop;
const Main        = imports.ui.main;
const Settings    = imports.ui.settings;
const Signals     = imports.signals;


// local imports
const EXTENSION_UUID = "timepp@matthiakl";
const AppletDir = imports.ui.appletManager.applets[EXTENSION_UUID];
const PANEL_ITEM    = AppletDir.lib.panel_item;
const ICON_FROM_URI = AppletDir.lib.icon_from_uri;
const MULTIL_ENTRY  = AppletDir.lib.multiline_entry;
const NUM_PICKER    = AppletDir.lib.num_picker;
const DAY_CHOOSER   = AppletDir.lib.day_chooser;
const I18N           = AppletDir.lib.gettext;


const CACHE_FILE = GLib.get_home_dir() + '/.cache/timepp_alarms.json';

const gen_ID = function () {
    return '_' + Math.random().toString(36).substr(2, 9);
}


/*
 * @DATA_DEFS:
 * -----------------------
 * time_str: (string) Time in hr:min 24h format. E.g., '12:44'.
 * days:     (array)  Ints corresponding to days of the week. Sunday is 0.
 * ID:       (string) Return value of gen_ID.
 * alarm:    (obj)    { time_str : time_str,
 *                      msg      : string,
 *                      days     : days,
 *                      toggle   : bool,
 *                      ID       : ID, }
 */


// =====================================================================
// @@@ Main
// =====================================================================
function Alarms(applet, settings, metadata, instance_id, orientation) {
    this._init(applet, settings, metadata, instance_id, orientation);
};

Alarms.prototype = {
    _init: function(applet, settings, metadata, instance_id, orientation) {
        try {
            this.section_name = 'Alarms';

            this.applet   = applet;
            this.metadata = metadata;

            // NOTE:
            // If the value in the setting is an array/obj, then each time we
            // change it, we must also fire the .save() method on it!
            // E.g., value.push(i); value.save();
            settings.bindWithObject(this, 'alarm_key_open', 'key_open', this._toggle_keybinding);
            settings.bindWithObject(this, 'alarm_icon', 'alarm_icon', this._update_panel_icon_name);
            settings.bindWithObject(this, 'alarm_separate_menu', 'separate_menu');
            settings.bindWithObject(this, 'alarm_snooze_duration', 'snooze_duration');


            //
            // add panel item
            //
            this.panel_item = new PANEL_ITEM.PanelItem(applet, metadata, orientation, 'Alarms');

            this.panel_item.actor.add_style_class_name('alarm-panel-item');
            this.panel_item.set_mode('icon');

            applet.actor.add_actor(this.panel_item.actor);


            //
            // alarms pane
            //
            this.actor = new St.Bin({x_fill: true, style_class: 'section alarm-section'});
            this.alarms_pane = new PopupMenu.PopupMenuSection();
            this.actor.add_actor(this.alarms_pane.actor);


            //
            // add new alarm item
            //
            this.add_alarm_item = new PopupMenu.PopupIconMenuItem(I18N._('Add New Alarm...'), 'list-add', St.IconType.SYMBOLIC, {style_class: 'add-alarm'});
            this.alarms_pane.addMenuItem(this.add_alarm_item);


            //
            // add new alarm settings container
            //
            this.add_new_alarm_container = new St.Bin({ x_fill: true });
            this.alarms_pane.addActor(this.add_new_alarm_container);


            //
            // alarm items box
            //
            this.alarms_scroll = new St.ScrollView({ style_class: 'alarms-container popup-menu-item', x_fill: true, y_align: St.Align.START});
            this.alarms_pane.addActor(this.alarms_scroll);
            this.alarms_scroll.hide(); // it will get shown if an alarm item gets added to it

            this.alarms_scroll_content = new PopupMenu.PopupMenuSection();
            this.alarms_scroll.add_actor(this.alarms_scroll_content.actor);
            this.alarms_scroll_content.actor.add_style_class_name('alarms-content-box');
            this.alarms_scroll_content.passEvents = true;


            //
            // listen
            //
            this.panel_item.connect('click', Lang.bind(this, function () {
                this.emit('toggle-menu');
            }));
            this.add_alarm_item.connect('activate', Lang.bind(this, this._prompt_new_alarm));

            // enable scrolling by grabbing with the mouse
            // requires that the 'passEvent' bool inside the top menu is disabled
            // the top menu is passed as parameter on object creation
            let vscroll = this.alarms_scroll.get_vscroll_bar();
            vscroll.connect('scroll-start', Lang.bind(this, function () { applet.menu.passEvents = true; }));
            vscroll.connect('scroll-stop', Lang.bind(this, function () { applet.menu.passEvents = false; }));


            //
            // load
            //
            this._load();
        } catch(e) {
            global.logError(e);
        }
    },

    _load: function () {
        if (! this.cache_file) {
            // Using the built-in settings to cache various things seems to be
            // rather unreliable, so we store certain things manually into
            // separate files.
            this.cache_file = Gio.file_new_for_path(CACHE_FILE);

            if ( this.cache_file.query_exists(null) ) {
                let [a, contents, b] = this.cache_file.load_contents(null);
                this.cache = JSON.parse(contents);
            } else {
                this.cache = {
                    enabled: true,
                    alarms:  [],
                };
            }
        }

        // don't load any further if this section is disabled
        if (! this.cache.enabled) return;


        for (var i = 0, len = this.cache.alarms.length; i < len; i++)
            this._add_alarm(i);

        this._toggle_keybinding();
        this._update_panel_item_UI();
        this._update_panel_icon_name();
    },

    _store_cache: function () {
        if (! this.cache_file.query_exists(null))
            this.cache_file.create(Gio.FileCreateFlags.NONE, null);

        this.cache_file.replace_contents(JSON.stringify(this.cache), null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    },

    _prompt_new_alarm: function () {
        // Hiding will remove the focus from the item as well as the menu, and
        // as a result, the menu will close. Make sure an actor grabs focus
        // before that happens.
        this.settings = new AlarmSettings(this.applet, null, true);
        this.add_new_alarm_container.add_actor(this.settings.actor);
        this.settings.button_cancel.grab_key_focus();
        this.add_alarm_item.actor.hide();

        // listen
        this.settings.connect('ok', Lang.bind(this, function (actor, alarm) {
            this.add_alarm_item.actor.show();
            this.add_alarm_item.actor.grab_key_focus();
            this._add_alarm(alarm);
            this.settings.actor.destroy();
        }));

        this.settings.connect('cancel', Lang.bind(this, function () {
            this.actor.grab_key_focus();
            this.add_alarm_item.actor.show();
            this.settings.actor.destroy();
        }));
    },

    // input is either an alarm or an index into the cache
    _add_alarm: function (a) {
        let new_ID = gen_ID();
        let alarm;

        // Every time we load/add/update a new alarm, we recompute a new ID.
        // This avoids any possibility of executing the same alarms multiple
        // times since alarms that were previously scheduled are still in the
        // mainloop.
        // We check if the alarm is in the cache, or if it's is a new alarm.
        if (typeof(a) === 'number') {
            this.cache.alarms[a].ID = new_ID;
            this._store_cache();
            alarm = this.cache.alarms[a];
        } else {
            a.ID = new_ID;
            this.cache.alarms.push(a);
            this._store_cache();
            alarm = a;
        }

        this._schedule_alarm(alarm);

        this._update_panel_item_UI();

        let alarm_item = new AlarmItem(this.applet, alarm);
        this.alarms_scroll_content.addActor(alarm_item.actor);
        this.alarms_scroll.show();

        //
        // listen
        //
        alarm_item.connect('alarm-updated', Lang.bind(this, function () {
            let old_ID = alarm.ID;
            alarm.ID = gen_ID();
            this._update_alarm(alarm, old_ID);
            this._schedule_alarm(alarm);
        }));

        alarm_item.connect('alarm-deleted', Lang.bind(this, function () {
            this._delete_alarm(alarm);
        }));
    },

    // Normally the cache array should be updated already since an array
    // houses only pointers, but that is not the case with an array created
    // with the settings manager; it needs to be updated 'manually'.
    // This also means we need to make sure to have the old ID of the object
    // we are trying to update.
    _update_alarm: function (alarm, old_ID) {
        for (let i = 0, len = this.cache.alarms.length; i < len; i++)
            if (this.cache.alarms[i].ID === old_ID) {
                this.cache.alarms[i] = alarm;
                break;
            }

        this._store_cache();

        this._update_panel_item_UI();
    },

    // deletes the corresponding alarm from the cache
    _delete_alarm: function (alarm) {
        for (let i = 0, len = this.cache.alarms.length; i < len; i++)
            if (this.cache.alarms[i].ID === alarm.ID) {
                this.cache.alarms.splice(i, 1);
                break;
            }

        this._store_cache();

        this._update_panel_item_UI();

        // If the alarms container has any padding and is empty, it will look
        // very ugly, so hide it in that case.
        if (this.alarms_scroll_content.box.get_children().length === 0)
            this.alarms_scroll.hide();
    },

    // @alarm: An alarm object.
    // @time:  A natural represeting seconds.
    //
    // If @time is given, the alarm will be scheduled @time seconds into the
    // future, and it will NOT be re-scheduled for the next 24h.
    // Otherwise, the alarm will be scheduled according to it's time_str.
    _schedule_alarm: function (alarm, time) {
        let ID = alarm.ID;

        if (!time) {
            let [future_hr, future_min] = alarm.time_str.split(':');
            let future_time = (future_hr * 3600) + (future_min * 60);

            let now = new Date();
            let hr  = now.getHours();
            let min = now.getMinutes();
            let sec = now.getSeconds();
            let current_time = (hr * 3600) + (min * 60) + sec - 1;

            time = (86400 - current_time + future_time) % 86400;

            if (time === 0) time = 86400;
        }

        Mainloop.timeout_add_seconds(time, Lang.bind(this, function () {
            if (time)
                this._fire_alarm(ID, alarm, true);
            else
               this._fire_alarm(ID, alarm);
        }));
    },

    // @snooze: bool
    // If snooze is true, the alarm will NOT be re-scheduled for 24h.
    _fire_alarm: function (ID, alarm, snooze) {
        let today = new Date().getDay();

        for (let i = 0, len = this.cache.alarms.length; i < len; i++) {
            if (ID !== this.cache.alarms[i].ID) continue;

            if ( alarm.toggle && (alarm.days.indexOf(today) >= 0) ) {
                this._send_alarm_notif(alarm);
                if (!snooze) this._schedule_alarm(alarm);
                break;
            }
        }
    },

    _send_alarm_notif: function (alarm) {
        // The source gets destroyed every time, so rebuild it.
        if (!this._source) {
            this._source = new MessageTray.Source();

            this._source.connect('destroy', Lang.bind(this, function() {
                this._source = null;
            }));

            if (Main.messageTray) Main.messageTray.add(this._source);
        }

        let icon = new St.Icon({ icon_size: 32});
        ICON_FROM_URI.icon_from_uri(icon, this.alarm_icon, this.metadata);

        this.notif = new MessageTray.Notification(this._source, alarm.time_str, alarm.msg, { icon: icon, bodyMarkup: true});
        this.notif.setUrgency(MessageTray.Urgency.CRITICAL);

        this.notif.addButton('snooze', I18N._('Snooze'));

        // listen
        this.notif.connect('action-invoked', Lang.bind(this, function (n, action_id) {
            this._schedule_alarm(alarm, this.snooze_duration);
        }));

        this.notif.connect('destroy', function () {
            this.notif = null;
        });

        // fire notif
        this._source.notify(this.notif);
    },

    _update_panel_item_UI: function () {
        this.panel_item.actor.remove_style_class_name('on');

        for (let i = 0, len = this.cache.alarms.length; i < len; i++)
            if (this.cache.alarms[i].toggle) {
                this.panel_item.actor.add_style_class_name('on');
                break;
            }
    },

    _update_panel_icon_name: function () {
        ICON_FROM_URI.icon_from_uri(this.panel_item.icon, this.alarm_icon, this.metadata);
        // If the path was relative the set_icon_name_from_path will convert to
        // absolute. We update the timer_icon in order to not have a broken
        // icon in the applet gtk settings window.
        this.alarm_icon = this.panel_item.icon.get_gicon().to_string();
    },

    // This method will be called by applet.js when the section is enabled
    // or disabled.
    toggle_section: function () {
        if (this.cache.enabled) {
            this._load();
        } else {
            // Recompute all the id's in order to prevent the alarms from the
            // mainloop from firing, then destroy all the alarm items.
            for (let i = 0, len = this.cache.alarms.length; i < len; i++)
                this.cache.alarms[i].ID = gen_ID();

            this.alarms_scroll_content.box.destroy_all_children();
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
                    this.applet.open_menu(this);
                }));
            }
        }
        else
            if (this.key_id) Main.keybindingManager.removeHotKey(this.key_id);
    },

    on_applet_removed_from_panel: function () {
        if (this.key_id) Main.keybindingManager.removeHotKey(this.key_id);
    },
};
Signals.addSignalMethods(Alarms.prototype);



// =====================================================================
// @@@ Alarm Settings
//
// @applet:           actual applet (needed for the multiline entry)
// @alarm:            alarm object
// @scrollable_entry: bool (make entry grow or use scroll)
//
// @signals: 'ok', 'cancel', 'delete'.
//
// If @alarm is not given the 'delete' signal won't be emitted at all.
// If @alarm is given, it's time_str, days, and msg will be updated, and the
// settings widget will be pre-populated with the alarms settings; otherwise,
// a complete new alarm object will be returned with the 'ok' signal.
// =====================================================================
function AlarmSettings(applet, alarm, scrollable_entry) {
    this._init(applet, alarm, scrollable_entry);
};

AlarmSettings.prototype = {
    _init: function(applet, alarm, scrollable_entry) {
        try {
            this.alarm = alarm;
            let sep;


            //
            // container
            //
            this.actor = new St.Bin({ x_fill: true, style_class: 'view-box popup-menu-item' });

            this.content_box = new St.BoxLayout({ x_expand: true, vertical: true, style_class: 'view-box-content menu-favorites-box' });
            this.actor.add_actor(this.content_box);

            if (alarm) {
                this.actor.style_class = '';
                this.content_box.style_class = '';
            }


            //
            // time pad
            //
            this.alarms_numpicker_box  = new St.BoxLayout({style_class: 'popup-menu-item numpicker-box'});
            this.content_box.add_actor(this.alarms_numpicker_box);

            this.hh_bin = new St.Bin({x_align: 1});
            this.alarms_numpicker_box.add(this.hh_bin, {expand: true});

            this.hh  = new NUM_PICKER.NumPicker(0, 23);
            this.hh_bin.add_actor(this.hh.actor);

            this.mm_bin = new St.Bin({x_align: 1});
            this.alarms_numpicker_box.add(this.mm_bin, {expand: true});

            this.mm = new NUM_PICKER.NumPicker(0, 59);
            this.mm_bin.add_actor(this.mm.actor);

            if (alarm) {
                let [hr_str, min_str] = alarm.time_str.split(':');
                this.hh._set_counter(parseInt(hr_str));
                this.mm._set_counter(parseInt(min_str));
            }


            //
            // choose day
            //
            this.day_chooser = new DAY_CHOOSER.DayChooser(alarm ? false : true);
            this.content_box.add_actor(this.day_chooser.actor);

            if (alarm)
                for (let i = 0; i < alarm.days.length; i++) {
                    let btn = this.day_chooser.actor.get_child_at_index(alarm.days[i]);
                    btn.checked = true;
                }



            //
            // entry
            //
            this.alarm_entry_container = new St.BoxLayout({ vertical: true, style_class: 'popup-menu-item entry-container' });
            this.content_box.add_actor(this.alarm_entry_container);
            this.entry = new MULTIL_ENTRY.MultiLineEntry(I18N._('Alarm Message...'), scrollable_entry, false);

            this.alarm_entry_container.add_actor(this.entry.actor);

            if (alarm) {
                Meta.later_add(Meta.LaterType.BEFORE_REDRAW, Lang.bind(this, function() {
                    this.entry.entry.set_text(alarm.msg);
                }));

                Meta.later_add(Meta.LaterType.BEFORE_REDRAW, Lang.bind(this, function() {
                    this.entry._resize_entry();
                }));
            }


            //
            // buttons
            //
            let alarms_settings_btn_box = new St.BoxLayout({ style_class: 'popup-menu-item btn-box', width: 350 });
            this.content_box.add_actor(alarms_settings_btn_box);

            if (alarm) {
                this.button_delete = new St.Button({ can_focus: true, label: I18N._('Delete'), style_class: 'btn-delete button notification-icon-button', x_expand: true });
                alarms_settings_btn_box.add(this.button_delete, {expand: true});

                this.button_delete.connect('clicked', Lang.bind(this, function () {
                    this.emit('delete');
                }));
            };

            this.button_cancel = new St.Button({ can_focus: true, label: I18N._('Cancel'), style_class: 'btn-cancel button notification-icon-button', x_expand: true });
            this.button_ok     = new St.Button({ can_focus: true, label: I18N._('Ok'), style_class: 'btn-ok button notification-icon-button', x_expand: true });
            alarms_settings_btn_box.add(this.button_cancel, {expand: true });
            alarms_settings_btn_box.add(this.button_ok, {expand: true });


            //
            // listen
            //
            this.button_ok.connect('clicked', Lang.bind(this, function () {
                // If an alarm was passed as param, we update it; otherwise, we
                // construct a new object and pass it with the emit signal.
                if (this.alarm) {
                    this.alarm.time_str = this._get_time_str(),
                    this.alarm.msg      = this.entry.entry.get_text(),
                    this.alarm.days     = this._get_days(),

                    this.emit('ok');
                }
                else {
                    this.emit('ok', {
                        time_str: this._get_time_str(),
                        msg:      this.entry.entry.get_text(),
                        days:     this._get_days(),
                        toggle:   true,
                        ID:       gen_ID(),
                    });
                }
            }));

            this.button_cancel.connect('clicked', Lang.bind(this, function () {
                this.emit('cancel');
            }));
        } catch(e) {
            global.logError(e);
        }
    },

    _get_days: function () {
        let days = [];

        for (let i = 0; i < 7; i++) {
            let btn = this.day_chooser.actor.get_child_at_index(i);
            if (btn.checked) days.push(i);
        }

        return days;
    },

    _get_time_str: function () {
        return this.hh.counter_label.get_text() + ':' + this.mm.counter_label.get_text();
    },
};
Signals.addSignalMethods(AlarmSettings.prototype);



// =====================================================================
// @@@ Alarm Item
//
// signals: 'alarm-updated', 'alarm-deleted'
// =====================================================================
function AlarmItem(applet, alarm) {
    this._init(applet, alarm);
};

AlarmItem.prototype = {
    _init: function(applet, alarm) {
        try {
            this.applet = applet;
            this.alarm  = alarm;

            this.msg_vert_padding = -1;


            //
            // container
            //
            this.actor = new St.BoxLayout({vertical:true, style_class: 'alarm-item menu-favorites-box'});

            this.alarm_item_content = new St.BoxLayout({vertical: true, style_class: 'alarm-item-content'});
            this.actor.add_actor(this.alarm_item_content);


            //
            // header
            //
            this.header = new St.BoxLayout({style_class: 'alarm-item-header'});
            this.alarm_item_content.add_actor(this.header);


            this.time = new St.Label({ text: alarm.time_str, y_align: St.Align.END, x_align: St.Align.START, style_class: 'alarm-item-time' });
            this.header.add(this.time, {expand: true});

            this.option_box = new St.BoxLayout({y_align: Clutter.ActorAlign.CENTER, x_align: Clutter.ActorAlign.CENTER, style_class: 'option-box'});
            this.header.add_actor(this.option_box);

            this.toggle     = new PopupMenu.Switch(alarm.toggle);
            this.toggle_bin = new St.Button({y_align: St.Align.START, x_align: St.Align.END });
            this.toggle.actor.can_focus = true;
            this.toggle_bin.add_actor(this.toggle.actor);

            this.option_box.add(this.toggle_bin);

            this.settings_icon = new St.Icon({icon_name: 'open-menu'});
            this.settings_bin  = new St.Button({ can_focus: true, y_align: St.Align.MIDDLE, x_align: St.Align.END, style_class: 'settings-icon'});
            this.settings_bin.add_actor(this.settings_icon);

            this.option_box.add(this.settings_bin);


            //
            // body
            //
            this.msg = new St.Label({ y_align: St.Align.END, x_align: St.Align.START, style_class: 'alarm-item-message'});
            this.alarm_item_content.add_actor(this.msg);

            if (!alarm.msg) this.msg.hide();
            else this.msg.clutter_text.set_markup(alarm.msg);

            this.msg.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
            this.msg.clutter_text.set_single_line_mode(false);
            this.msg.clutter_text.set_line_wrap(true);
            this.msg.clutter_text.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);


            //
            // listen
            //
            this.toggle_bin.connect('clicked', Lang.bind(this, this._on_toggle));
            this.settings_bin.connect('clicked', Lang.bind(this, this._on_settings));
            this.actor.connect('queue-redraw', Lang.bind(this, this._resize_alarm_item));
        } catch(e) {
            global.logError(e);
        }
    },

    _on_toggle: function () {
        this.toggle.toggle();
        this.alarm.toggle = !this.alarm.toggle;
        this.emit('alarm-updated');
    },

    _on_settings: function () {
        this.actor.grab_key_focus();
        this.alarm_item_content.hide();

        let alarm_settings = new AlarmSettings(this.applet, this.alarm, false);
        this.actor.add_actor(alarm_settings.actor);
        alarm_settings.button_cancel.grab_key_focus();


        //
        // listen
        //
        alarm_settings.connect('ok', Lang.bind(this, function () {
            this.toggle.setToggleState(this.alarm.toggle);
            this.time.set_text(this.alarm.time_str);
            this.msg.clutter_text.set_markup(this.alarm.msg);

            if (this.alarm.msg) this.msg.show();
            else this.msg.hide();

            this.actor.grab_key_focus();
            alarm_settings.actor.destroy();
            this.alarm_item_content.show();

            this.emit('alarm-updated');
        }));

        alarm_settings.connect('delete', Lang.bind(this, function () {
            this.applet.actor.grab_key_focus();
            this.actor.destroy();
            this.emit('alarm-deleted');
        }));

        alarm_settings.connect('cancel', Lang.bind(this, function () {
            this.actor.grab_key_focus();
            alarm_settings.actor.destroy();
            this.alarm_item_content.show();
        }));
    },

    _resize_alarm_item: function () {
        // Lookup St.ThemeNode and ClutterActor reference manuals for more info.
        let theme_node = this.msg.get_theme_node();
        let alloc_box  = this.msg.get_allocation_box();
        let width      = alloc_box.x2 - alloc_box.x1; // gets the acutal width of the box
        width          = theme_node.adjust_for_width(width); // removes paddings and borders

        // nat_height is the minimum height needed to fit the multiline text
        // **excluding** the vertical paddings/borders.
        let [min_height, nat_height] = this.msg.clutter_text.get_preferred_height(width);

        // The vertical padding can only be calculated once the box is painted.
        // nat_height_adjusted is the minimum height needed to fit the multiline
        // text **including** vertical padding/borders.
        if (this.msg_vert_padding < 0) {
            let [min_height_adjusted, nat_height_adjusted] = theme_node.adjust_preferred_height(min_height, nat_height);
            this.msg_vert_padding = nat_height_adjusted - nat_height;
        }

        this.msg.set_height(nat_height + this.msg_vert_padding);
    },
};
Signals.addSignalMethods(AlarmItem.prototype);
