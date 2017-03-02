const Clutter = imports.gi.Clutter;
const Main      = imports.ui.main;
const St      = imports.gi.St;
const Lang    = imports.lang;

const LPAD = imports.applet.lib.leftpad;


/*
 * Number picker
 * A simple widget for picking numbers in a confined way.
 *
 * @num_min, @num_max: number or null

 * @num_min and @num_max are the interval bounds. Use null for no bound.
 * If both @num_min and @num_max are numbers, the picker will wrap around.
 */
function NumPicker(num_min, num_max, num_init) {
    if ( !(typeof(num_min) === 'number' || num_min === null ) ||
         !(typeof(num_max) === 'number' || num_max === null ) ) {
        global.logError('NumPicker needs number or null, got ' + num_min + ' and ' + num_max);
        return;
    }

    this._init(num_min, num_max, num_init);
}
NumPicker.prototype = {
    _init: function(num_min, num_max, num_init) {
        try {
            this.num_min  = num_min;
            this.num_max  = num_max;
            this.num_init = num_init;


            this.actor = new St.BoxLayout({ reactive: true,
                                            y_expand: true,
                                            x_expand: true,
                                            style_class: 'numpicker button notification-icon-button modal-dialog-button' });


            //
            // counter
            //
            this.counter_box = new St.Bin({style_class: 'numpicker-counter'});
            this.actor.add_actor(this.counter_box);
            this.counter = new St.Label({ text: this.num_min ? LPAD.lpad(this.num_min, 2) : '00' });
            this.counter_box.add_actor(this.counter);


            //
            // arrows
            //
            this.btn_box = new St.BoxLayout({vertical: true, y_align: Clutter.ActorAlign.CENTER, style_class: 'numpicker-arrow-box'});
            this.actor.add_actor(this.btn_box);

            this.btn_up   = new St.Button({can_focus: true, style_class: 'numpicker-arrow'});
            this.btn_down = new St.Button({can_focus: true, style_class: 'numpicker-arrow'});
            this.btn_box.add_actor(this.btn_up);
            this.btn_box.add_actor(this.btn_down);

            this.arrow_up   = new St.Icon({icon_name: 'pan-up-symbolic'});
            this.arrow_down = new St.Icon({icon_name: 'pan-down-symbolic'});
            this.btn_up.add_actor(this.arrow_up);
            this.btn_down.add_actor(this.arrow_down);


            //
            // listen
            //
            this.btn_up.connect('button-press-event', Lang.bind(this, this._on_press_event, 'up'));
            this.btn_up.connect('key-press-event', Lang.bind(this, this._on_press_event, 'up'));

            this.btn_down.connect('button-press-event', Lang.bind(this, this._on_press_event, 'down'));
            this.btn_down.connect('key-press-event', Lang.bind(this, this._on_press_event, 'down'));

            this.actor.connect('scroll-event', Lang.bind(this, this._on_scroll_event));
        } catch(e) {
            global.logError(e);
        }
    },

    _on_press_event: function (actor, event, step) {
        if (event.type() === Clutter.EventType.BUTTON_PRESS) {
            let button_id = event.get_button();

            if (button_id === Clutter.BUTTON_PRIMARY)
                this._update_counter(step);
        }
        else if (event.type() === Clutter.EventType.KEY_PRESS) {
            let key_id = event.get_key_symbol();

            if (key_id == Clutter.KEY_space || key_id == Clutter.KEY_Return)
                this._update_counter(step);
        }
    },

    _on_scroll_event: function (actor, event) {
        try {
        let direction = event.get_scroll_direction();

        if (direction == Clutter.ScrollDirection.DOWN)
            this._update_counter('down');
        else if (direction == Clutter.ScrollDirection.UP)
            this._update_counter('up');
        } catch (e) {
            global.logError(e);
        }
    },

    _update_counter: function (step) {
        let ctn;
        if (step === 'up')   ctn = parseInt(this.counter.get_text()) + 1;
        if (step === 'down') ctn = parseInt(this.counter.get_text()) - 1;

        if ( (typeof(this.num_max) === 'number') && (ctn > this.num_max) ) {
            if (typeof(this.num_min) === 'number')
                this.counter.set_text( LPAD.lpad(this.num_min, 2) );
        }
        else if ( (typeof(this.num_min) === 'number') && (ctn < this.num_min) ) {
            if (typeof(this.num_max) === 'number')
                this.counter.set_text( LPAD.lpad(this.num_max, 2) );
        }
        else
            this.counter.set_text( LPAD.lpad(ctn, 2) );
    },
}
