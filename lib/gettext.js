const GLib    = imports.gi.GLib;
const Gettext = imports.gettext;

function _(str, UUID) {
    Gettext.bindtextdomain(UUID, GLib.get_home_dir() + '/.local/share/locale')

    let custom_translation = Gettext.dgettext(UUID, str);

    if (custom_translation != str) return custom_translation;

    return Gettext.gettext(str);
};
