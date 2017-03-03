const St      = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Pango   = imports.gi.Pango;
const Gtk     = imports.gi.Gtk;
const Lang    = imports.lang;


/*
 * Multi-Line Entry
 *
 * @hint_text:  string
 * @scrollable: bool   (Make entry use scrollbar or grow indefinetly.)
 *
 * The container of this object should have access to the top popup-menu in
 * order to make the scrollbar move when grabbed by the mouse. See AlarmSettings
 * object for an example of this.
 */
function MultiLineEntry(hint_text, scrollable) {
    this._init(hint_text, scrollable);
}
MultiLineEntry.prototype = {
    _init: function(hint_text, scrollable) {
        try {
            this.scrollable = scrollable;

            this.entry_vert_padding = -1;

            this.actor = new St.BoxLayout({ vertical: true });

            this.scroll_box = new St.ScrollView({ x_fill: true, y_align: St.Align.START, style_class: 'multiline-entry-scrollbox'});
            this.scroll_box.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC);
            this.actor.add(this.scroll_box);

            this.entry_container = new St.BoxLayout({ vertical: true });
            this.scroll_box.add_actor(this.entry_container);

            this.entry = new St.Entry({ can_focus: true, hint_text: hint_text, name: 'menu-search-entry' });
            this.entry.clutter_text.set_activatable(false);
            this.entry.clutter_text.set_single_line_mode(false);
            this.entry.clutter_text.set_line_wrap(true);
            this.entry.clutter_text.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
            this.entry.clutter_text.connect('text-changed', Lang.bind(this, this._resize_entry));
            this.entry_container.add_actor(this.entry);

        } catch(e) {
            global.logError(e);
        }
    },

    _resize_entry: function () {
        // Lookup St.ThemeNode and ClutterActor reference manuals for more info.

        let theme_node = this.entry.get_theme_node();
        let alloc_box  = this.entry.get_allocation_box();
        let width      = alloc_box.x2 - alloc_box.x1;        // gets the acutal width of the box
        width          = theme_node.adjust_for_width(width); // removes paddings and borders

        // nat_height is the minimum height needed to fit the multiline text
        // **excluding** the vertical paddings/borders.
        let [min_height, nat_height] = this.entry.clutter_text.get_preferred_height(width);

        // The vertical padding can only be calculated once the box is painted.
        // nat_height_adjusted is the minimum height needed to fit the multiline
        // text **including** vertical padding/borders.
        if (this.entry_vert_padding < 0) {
            let [min_height_adjusted, nat_height_adjusted] = theme_node.adjust_preferred_height(min_height, nat_height);
            this.entry_vert_padding = nat_height_adjusted - nat_height;
        }

        this.entry.set_height(nat_height + this.entry_vert_padding);

        if (this.scrollable)
            this.scroll_box.min_height = nat_height + this.entry_vert_padding;
    },
}
