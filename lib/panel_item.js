const Applet        = imports.ui.applet;
const AppletManager = imports.ui.appletManager;
const Pango         = imports.gi.Pango;
const Tooltips      = imports.ui.tooltips;
const St            = imports.gi.St;
const Gtk           = imports.gi.Gtk;
const Gio           = imports.gi.Gio
const GLib          = imports.gi.GLib;
const Clutter       = imports.gi.Clutter;
const Lang          = imports.lang;
const Settings      = imports.ui.settings;
const Signals       = imports.signals;


/*
 * Panel Item
 *
 * @applet:      the applet object
 * @metadata:    applet metadata
 * @orientation: panel orientation
 * @icon_path:   this can be either an absolute file path, a file path
 *               relative to this applet's dir, or just a regular icon name
 * @label:       the label in the panel (no label if omitted)
 * @tooltip:     tooltip label (no tooltip if omitted)
 *
 * @signals:
 *     'click' :       on mouse click
 *     'middle-click': on mouse middle click
 */
function PanelItem(applet, metadata, orientation, tooltip) {
    this._init(applet, metadata, orientation, tooltip);
}

PanelItem.prototype = {
    _init: function(applet, metadata, orientation, tooltip) {
        this.applet      = applet;
        this.metadata    = metadata;
        this.orientation = orientation;

        this._mode = 'icon_text'; // one of 'icon', 'text', 'icon_text'

        //
        // draw
        //
        this.actor = new St.Button({style_class: 'applet-box'});

        // the tooltip needs both this.applet as well as this.actor
        if (tooltip) tooltip = new Tooltips.PanelItemTooltip(this, tooltip, this.orientation);

        this.box_content = new St.BoxLayout();
        this.actor.add_actor(this.box_content);

        this.icon = new St.Icon();
        this.box_content.add_actor(this.icon);

        this.label = new St.Label({visible: false, y_align: Clutter.ActorAlign.CENTER, style_class: 'applet-label'});
        this.box_content.add_actor(this.label);


        //
        // on load
        //
        this._on_orientation_changed();
        this._resize();


        //
        // listen
        //
        this.actor.connect('button-press-event', Lang.bind(this, function(actor, event) {
            if (event.get_button() === Clutter.BUTTON_MIDDLE)
                this.emit('middle-click');
        }));

        this.actor.connect('button-press-event', Lang.bind(this, function (actor, event) {
            if (event.get_button() === Clutter.BUTTON_PRIMARY)
                this.emit('click');
        }));

        // make non-reactive when in panel-edit mode
        global.settings.connect('changed::panel-edit-mode', Lang.bind(this, function () {
            this.actor.reactive = !( global.settings.get_boolean('panel-edit-mode') );
        }));

        // We only listen for when the menu closes and remove the checked
        // state from the panel item.
        // When the menu opens, the _menu_toggled method will be called by
        // the applet.
        this.applet.menu.connect('open-state-changed', Lang.bind(this, function (actor, open, item) {
            if (!open) item.remove_style_pseudo_class('checked');
        }, this.actor));
    },

    // This function will be called by the applet when the menu is opened.
    // If am_open is true, it means that the section that corresponds to this
    // panel item is currently open; otherwise, it means it's not.
    _menu_toggled: function (am_open) {
        if (am_open) this.actor.add_style_pseudo_class('checked');
    },

    _resize: function () {
        let panel_height = this.applet._panelHeight;
        let _scaleMode = 1;//AppletManager.panel.scaleMode;

        let symb_scaleup = ((panel_height / Applet.DEFAULT_PANEL_HEIGHT) * Applet.PANEL_SYMBOLIC_ICON_DEFAULT_HEIGHT) / global.ui_scale;
        let fullcolor_scaleup = panel_height * Applet.COLOR_ICON_HEIGHT_FACTOR / global.ui_scale;
        let icon_type = this.icon.get_icon_type();

        switch (icon_type) {
            case St.IconType.FULLCOLOR:
                this.icon.set_icon_size(_scaleMode ? fullcolor_scaleup : Applet.DEFAULT_ICON_HEIGHT);
            break;
            case St.IconType.SYMBOLIC:
                this.icon.set_icon_size(_scaleMode ? symb_scaleup : -1);
            break;
            default:
                this.icon.set_icon_size(_scaleMode ? symb_scaleup : -1);
        }
    },

    _update: function () {
        if (this._mode === 'icon') {
            this.icon.show();
            this.label.hide();
            this.label.margin_left = 0.0;
        } else if (this._mode === 'text') {
            this.icon.hide();
            this.label.show();
            this.label.margin_left = 0.0;
        } else {
            this.icon.show();
            this.label.show();
            this.label.margin_left = 6.0;
        }

    },

    set_mode: function(mode) {
        this._mode = mode;
        if (! this._in_vert_panel()) this._update();
    },

    set_label: function (str) {
        this.label.text = str;

        if (! this._in_vert_panel() && this._mode !== 'icon') this.label.show();
        else this.label.hide();
    },

    _on_panel_height_changed: function () {
        this._resize();
    },

    _on_orientation_changed: function (orientation) {
        if ( typeof(orientation) === 'number' )
            this.orientation = orientation;

        if ( this._in_vert_panel() ) {
            this.actor.add_style_class_name('vertical');
            this.label.margin_left = 0.0;
            this.label.hide()
        } else {
            this.actor.remove_style_class_name('vertical');
            this.label.margin_left = 6.0;
            this._update();
        }
    },

    _in_vert_panel: function () {
        return (this.orientation == St.Side.LEFT || this.orientation === St.Side.RIGHT);
    },
};
Signals.addSignalMethods(PanelItem.prototype);
