// l10n/translation
const EXTENSION_UUID = "timepp@matthiakl";
const Gettext        = imports.gettext;
const GLib           = imports.gi.GLib;

Gettext.bindtextdomain(EXTENSION_UUID, GLib.get_home_dir() + "/.local/share/locale")

function _(str) {
   let custom_translation = Gettext.dgettext(EXTENSION_UUID, str);
   if (custom_translation !== str) return custom_translation;
   return Gettext.gettext(str);
}

function ngettext(str1, str2, n) {
   let custom_translation = Gettext.dngettext(EXTENSION_UUID, str1, str2, n);
   if (custom_translation !== str1 && custom_translation !== str2)
        return custom_translation;
   return Gettext.ngettext(str1, str2, n);
}
