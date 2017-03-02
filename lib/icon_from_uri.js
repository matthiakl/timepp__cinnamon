const St   = imports.gi.St;
const Gtk  = imports.gi.Gtk;
const GLib = imports.gi.GLib;
const Gio  = imports.gi.Gio


/*
 * @icon:      An St.Icon
 * @icon_path: Either an absolute path to an svg, a path relative to this
 *             applet's dir (e.g., /icons/timer-symbolic.svg), or just an icon
 *             name
 * @metadata:  Applet metadata
 *
 * The function will set the @icon's icon to @icon_path.
 */
function icon_from_uri (icon, icon_path, metadata) {
    if ( icon_path == '' ||
         ( GLib.path_is_absolute(icon_path) && GLib.file_test(icon_path, GLib.FileTest.EXISTS) ) ) {
        let file = Gio.file_new_for_path(icon_path);
        icon.set_gicon(new Gio.FileIcon({ file: file }));

        if ( icon_path.search('-symbolic.svg') === -1 )
            icon.set_icon_type(St.IconType.FULLCOLOR);
        else
            icon.set_icon_type(St.IconType.SYMBOLIC);
    }
    else if ( Gtk.IconTheme.get_default().has_icon(icon_path) ) {
        icon.set_icon_name(icon_path);

        if ( icon_path.search('-symbolic') === -1 )
            icon.set_icon_type(St.IconType.FULLCOLOR);
        else
            icon.set_icon_type(St.IconType.SYMBOLIC);
    }
    else if (icon_path.search(metadata.path) === -1) {
        let new_icon_path = metadata.path + icon_path;
        icon_from_uri(icon, new_icon_path, metadata);
    }
    else {
        icon.set_icon_name('dialog-question');
        icon.set_icon_type(St.IconType.SYMBOLIC);
    }

    if (icon.get_icon_type() === St.IconType.SYMBOLIC)
        icon.set_style_class_name('system-status-icon');
    else
        icon.set_style_class_name('applet-icon');
}
