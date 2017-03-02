const Cinnamon = imports.gi.Cinnamon;
const St       = imports.gi.St;
const Clutter  = imports.gi.Clutter;

const MSECS_IN_DAY = 24 * 60 * 60 * 1000;

//
// day chooser
//
function DayChooser (checked) {
    this._init(checked);
}
DayChooser.prototype = {
    _init: function (checked) {
        try {
            this.actor = new St.Widget({ layout_manager: new Clutter.BoxLayout({homogeneous: true}), reactive: true, style_class: 'popup-menu-item days' });

            this.week_start = Cinnamon.util_get_week_start();
            let iter        = new Date();
            iter.setSeconds(0); // leap second protection
            iter.setHours(12);

            for (let i = 0; i < 7; i++) {
                let day_pos = (7 - this.week_start + iter.getDay()) % 7;

                let btn = new St.Button({ label:       iter.toLocaleFormat('%a'),
                                          toggle_mode: true,
                                          checked:     checked,
                                          can_focus:   true,
                                          x_expand:    true,
                                          style_class: 'day' });

                this.actor.insert_child_at_index(btn, day_pos);

                iter.setTime(iter.getTime() + MSECS_IN_DAY);
            }
        } catch (e) {
            global.logError(e);
        }
    }
}
