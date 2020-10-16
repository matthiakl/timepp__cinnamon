const St          = imports.gi.St;
const Gio         = imports.gi.Gio
const Meta        = imports.gi.Meta;
const GLib        = imports.gi.GLib;
const Pango       = imports.gi.Pango;
const Clutter     = imports.gi.Clutter;
const Cinnamon    = imports.gi.Cinnamon;
const Main        = imports.ui.main;
const Settings    = imports.ui.settings;
const CheckBox    = imports.ui.checkBox;
const PopupMenu   = imports.ui.popupMenu;
const MessageTray = imports.ui.messageTray;
const Util        = imports.misc.util;
const Lang        = imports.lang;
const Signals     = imports.signals;
const Mainloop    = imports.mainloop;

const EXTENSION_UUID = "timepp@matthiakl";
const AppletDir = imports.ui.appletManager.applets[EXTENSION_UUID];
const FUZZ           = AppletDir.lib.fuzzy_search;
const LPAD           = AppletDir.lib.leftpad;
const NUM_PICKER     = AppletDir.lib.num_picker;
const PANEL_ITEM     = AppletDir.lib.panel_item;
const MULTIL_ENTRY   = AppletDir.lib.multiline_entry;
const ICON_FROM_URI  = AppletDir.lib.icon_from_uri;
const SCROLL_TO_ITEM = AppletDir.lib.scroll_to_item;
const I18N           = AppletDir.lib.gettext;


const CACHE_FILE = GLib.get_home_dir() + '/.cache/timepp_todo.json';


const CustomIcon = {
    EDIT            : '/img/edit-symbolic.svg',
    CLEAR           : '/img/clear-symbolic.svg',
    GRAPH           : '/img/graph-symbolic.svg',
    HIDDEN          : '/img/hidden-symbolic.svg',
    FILTER          : '/img/filter-symbolic.svg',
    CONTEXT         : '/img/context-symbolic.svg',
    TODO_LOADING    : '/img/todo-loading-symbolic.svg',
    SORT_ASCENDING  : '/img/sort-ascending-symbolic.svg',
    SORT_DESCENDING : '/img/sort-descending-symbolic.svg',
};


const SortOrder = {
    ASCENDING  : 'ASCENDING',
    DESCENDING : 'DESCENDING',
};


const SortType = {
    PRIORITY        : 'PRIORITY',
    DUE_DATE        : 'DUE_DATE',
    CREATION_DATE   : 'CREATION_DATE',
    COMPLETION_DATE : 'COMPLETION_DATE',
};


const View = {
    CLEAR         : 'CLEAR',
    STATS         : 'STATS',
    SEARCH        : 'SEARCH',
    EDITOR        : 'EDITOR',
    DEFAULT       : 'DEFAULT',
    LOADING       : 'LOADING',
    SELECT_SORT   : 'SELECT_SORT',
    NO_TODO_FILE  : 'NO_TODO_FILE',
    SELECT_FILTER : 'SELECT_FILTER',
};


const REG_CONTEXT  = /^@.+$/;
const REG_PROJ     = /^\+.+$/;
const REG_PRIO     = /^\([A-Z]\)$/;
const REG_TAG      = /^[^:]+:[^:]+$/;
const REG_DATE     = /^\d{4}-\d{2}-\d{2}$/;
const REG_PRIO_TAG = /^(?:pri|PRI):[A-Z]$/;
const REG_DUE_TAG  = /^(?:due|DUE):\d{4}-\d{2}-\d{2}$/;
const REG_URL      = /^(?:(?:https?|ftp):\/\/)?(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,}))\.?)(?::\d{2,5})?(?:[/?#]\S*)?$/;


// return date string in yyyy-mm-dd format adhering to locale
function date_yyyymmdd () {
    let now = new Date();

    let month = now.getMonth() + 1;
    let day   = now.getDate();

    month = (month < 10) ? ('-' + 0 + month) : ('-' + month);
    day   = (day   < 10) ? ('-' + 0 + day)   : ('-' + day);

    return now.getFullYear() + month + day;
}


// =====================================================================
// @@@ Main
// =====================================================================
function Todo(applet, settings, metadata, instance_id, orientation) {
    this._init(applet, settings, metadata, instance_id, orientation);
}

Todo.prototype = {
    _init: function (applet, settings, metadata, instance_id, orientation) {
        this.section_name = 'Todo';

        this.applet   = applet;
        this.metadata = metadata;
        this.settings = settings;


        // @NOTE:
        // If the value in the setting is an array/obj, then each time we
        // change it, we must also fire the .save() method on it!
        // E.g., value.push(i); value.save();
        settings.bindWithObject(this, 'todo_icon', 'todo_icon', this._update_panel_icon_name);
        settings.bindWithObject(this, 'todo_separate_menu', 'separate_menu');
        settings.bindWithObject(this, 'todo_panel_mode', 'panel_mode', this._toggle_panel_mode);
        settings.bindWithObject(this, 'todo_task_width', 'task_width', this._update_task_width);

        settings.bindWithObject(this, 'todo_txt_file_path', 'todo_txt_file_path', this._on_todo_file_changed);
        settings.bindWithObject(this, 'done_txt_file_path', 'done_txt_file_path');

        settings.bindWithObject(this, 'todo_key_open', 'key_open', this._toggle_keybinding);
        settings.bindWithObject(this, 'todo_key_open_to_add', 'key_open_to_add', this._toggle_keybinding);
        settings.bindWithObject(this, 'todo_key_open_to_search', 'key_open_to_search', this._toggle_keybinding);


        //
        // load cache file
        //
        this.cache_file = Gio.file_new_for_path(CACHE_FILE);

        if (this.cache_file.query_exists(null)) {
            let [, contents] = this.cache_file.load_contents(null);
            this.cache = JSON.parse(contents);
        }
        else
            this.cache = {
                enabled : true,
                sort: {
                    sort_order : SortOrder.DESCENDING,
                    sort_type  : SortType.PRIORITY,
                },
                filters: {
                    show_hidden   : false,
                    invert_filters: false,
                    custom_filters: [],
                    active_filters: {
                        priorities : [],
                        contexts   : [],
                        projects   : [],
                        custom     : [],
                    },
                },
            };


        // Initiated later
        // Used for switching between different views (search_view, filter_view,
        // sort_view, etc...)
        this.view_manager = null;

        // Initiated later
        this.time_tracker = null;


        // Track all the priorities, contexts, and projects across all tasks.
        //
        // @key:   string  (a context/project/priority)
        // @value: natural (number of tasks that have that @key)
        //
        // The values of a priority can be:
        // (~) if hidden (x) if completed, (_) if no priority, else (A-Z).
        this.priorities = new Map();
        this.contexts   = new Map();
        this.projects   = new Map();


        // A GFile to the todo.txt file, GMonitor, and connect id.
        this.todo_txt_file;
        this.todo_file_monitor;
        this.todo_file_monitor_connect_id = null;


        // All task objects.
        this.tasks = [];


        // Array of all tasks that have been filtered. Only tasks in this array
        // can be added to the popup menu.
        this.tasks_viewport = [];


        // @SPEED
        // This is used by the _do_search func to store search queries and their
        // results for the duration of the search.
        //
        // @key:   string (a search query)
        // @value: array  (of tasks that match the search query)
        this.search_dictionary = new Map();


        // The last string that was searched for.
        this.last_search_pattern = '';


        // @SPEED
        // Since the functions '_create_tasks', '_add_tasks_to_menu', and
        // '_show_tasks' could take a lot of time to finish depending on the num
        // of tasks and could end up blocking the UI for too long, they are
        // async.
        // Race conditions can be resolved by removing them from the mainloop.
        //
        // These variables hold the mainloop source id's of the corresponding
        // funcs. If null, the corresponding proc is not running.
        this.create_task_objects_proc_id = null;
        this.add_tasks_to_menu_proc_id   = null;


        // The mainloop id of the _on_day_started_loop. If null, the loop is not
        // running.
        this.on_day_started_loop_id = null;


        // The special css properties 'context-color', 'project-color', and
        // 'link-color' can be used in the themes css file to style the task
        // markup.
        //
        // These css properties need to be added to the
        // 'timepp-menu todo-section' selector.
        //
        // The colors are parsed and stored in this object.
        this.markup_colors = {
            project : 'magenta',
            context : 'green',
            link    : 'blue',
        }


        // @SPEED
        // Tweak this function to completely disable animations when closing
        // this applet in order to avoid lag when there are lots of items.
        this.applet.menu.close = function () {
            if (!this.isOpen) return;
            this.isOpen = false;
            global.menuStackLength -= 1;
            Main.panelManager.updatePanelsVisibility();
            if (this._activeMenuItem) this._activeMenuItem.setActive(false);
            this.animating = false;
            this.actor.hide();
            this.emit('open-state-changed', false);
        }


        //
        // add panel item
        //
        this.panel_item = new PANEL_ITEM.PanelItem(applet, metadata, orientation, I18N._('Todo'));
        this.panel_item.actor.add_style_class_name('todo-panel-item off');
        this._update_panel_icon_name();
        this._toggle_panel_mode();

        applet.actor.add_actor(this.panel_item.actor);


        //
        // todo section
        //
        this.actor = new St.Bin({ style_class: 'section todo-section', x_fill: true });
        this.todo_pane = new PopupMenu.PopupMenuSection();
        this.actor.add_actor(this.todo_pane.actor);


        //
        // search entry bin
        //
        this.search_entry_bin = new St.BoxLayout({ visible: false, style_class: 'popup-menu-item' });
        this.todo_pane.addActor(this.search_entry_bin);

        this.search_entry = new St.Entry({ can_focus: true });
        this.search_entry_bin.add(this.search_entry, {expand: true});

        this.close_icon = new St.Icon({ icon_name: 'window-close' });
        this.search_entry.set_secondary_icon(this.close_icon);


        //
        // loading message
        //
        this.loading_msg = new St.Label({ can_focus: true, visible: false, text: I18N._('Loading...'), style_class: 'loading-msg popup-menu-item' });
        this.todo_pane.addActor(this.loading_msg);


        //
        // no todo filej message
        //
        this.no_todo_file_msg = new St.Label({ can_focus: true, visible: false, text: I18N._('Select todo file in settings...'), style_class: 'no-todo-file-msg popup-menu-item' });
        this.todo_pane.addActor(this.no_todo_file_msg);



        //
        // header
        //
        this.header = new St.BoxLayout({ visible: false, style_class: 'header' });
        this.todo_pane.addActor(this.header);

        this.add_task_button = new St.Button({ can_focus: true, x_align: St.Align.START, style_class: 'add-task' });
        this.header.add(this.add_task_button, { expand: true });

        this.add_task_bin = new St.BoxLayout({ style_class: 'popup-menu-item'});
        this.add_task_button.add_actor(this.add_task_bin);

        this.add_task_icon = new St.Icon({ icon_name: 'list-add', y_align: Clutter.ActorAlign.CENTER });
        this.add_task_bin.add_actor(this.add_task_icon);

        this.add_task_label = new St.Label({ text: I18N._('Add New Task...'), y_align: Clutter.ActorAlign.CENTER });
        this.add_task_bin.add_actor(this.add_task_label);


        this.icon_bin = new St.BoxLayout({ x_align: Clutter.ActorAlign.END, style_class: 'popup-menu-item icon-bin' });
        this.header.add(this.icon_bin);


        // clear icon
        this.clear_button = new St.Button({ visible: false, can_focus: true, x_align: St.Align.END, style_class: 'clear-icon' });
        this.icon_bin.add(this.clear_button);

        this.clear_icon = new St.Icon({ y_align: Clutter.ActorAlign.CENTER });
        this.clear_button.add_actor(this.clear_icon);

        ICON_FROM_URI.icon_from_uri(this.clear_icon, CustomIcon.CLEAR, this.metadata);


        // stats icon
        this.stats_button = new St.Button({ can_focus: true, x_align: St.Align.END, style_class: 'stats-icon' });
        this.icon_bin.add(this.stats_button);

        this.stats_icon = new St.Icon({ y_align: Clutter.ActorAlign.CENTER });
        this.stats_button.add_actor(this.stats_icon);

        ICON_FROM_URI.icon_from_uri(this.stats_icon, CustomIcon.GRAPH, this.metadata);


        // search icon
        this.search_button = new St.Button({ can_focus: true, x_align: St.Align.END, style_class: 'search-icon' });
        this.icon_bin.add(this.search_button);

        this.search_icon = new St.Icon({ icon_name: 'edit-find', y_align: Clutter.ActorAlign.CENTER });
        this.search_button.add_actor(this.search_icon);


        // sort icon
        this.sort_button = new St.Button({ can_focus: true, x_align: St.Align.END, style_class: 'sort-icon' });
        this.icon_bin.add(this.sort_button);

        this.sort_icon = new St.Icon({ y_align: Clutter.ActorAlign.CENTER });
        this.sort_button.add_actor(this.sort_icon);

        this._update_sort_icon();


        // filter icon
        this.filter_button = new St.Button({ can_focus: true, x_align: St.Align.END, style_class: 'filter-icon' });
        this.icon_bin.add(this.filter_button);

        this.filter_icon = new St.Icon({ y_align: Clutter.ActorAlign.CENTER });
        this.filter_button.add_actor(this.filter_icon);

        ICON_FROM_URI.icon_from_uri(this.filter_icon, CustomIcon.FILTER, this.metadata);


        //
        // task items box
        //
        this.tasks_scroll = new St.ScrollView({ visible: false, style_class: 'tasks-container popup-menu-item', x_fill: true, y_align: St.Align.START});
        this.todo_pane.addActor(this.tasks_scroll);
        // enable scrolling by grabbing with the mouse
        this.tasks_scroll.vscroll.connect('scroll-start', () => { applet.menu.passEvents = true; });
        this.tasks_scroll.vscroll.connect('scroll-stop', () => { applet.menu.passEvents = false; });

        this.tasks_scroll_content = new St.BoxLayout({ vertical: true, style_class: 'tasks-content-box'});
        this.tasks_scroll.add_actor(this.tasks_scroll_content);


        //
        // listen
        //
        this.panel_item.connect('click', () => { this.emit('toggle-menu'); });
        this.add_task_button.connect('clicked', () => { this.show_view__task_editor(); });
        this.clear_button.connect('clicked', () => { this.show_view__clear_completed(); });
        this.stats_button.connect('clicked', () => { this.show_view__time_tracker_stats(); });
        this.search_button.connect('clicked', () => { this.show_view__search(); });
        this.sort_button.connect('clicked', () => { this.show_view__sort(); });
        this.filter_button.connect('clicked', () => { this.show_view__filters(); });
        this.search_entry.connect('secondary-icon-clicked', () => { this.show_view__default(); });
        this.actor.connect('style-changed', () => { this._update_markup_colors(); });
        this.search_entry.clutter_text.connect('text-changed', () => {
            Mainloop.idle_add(() => this._search());
        });


        //
        // If this section is not enabled, we don't load everything.
        //
        if (this.cache.enabled) this._init__later();
    },

    _init__later: function () {
        this.view_manager = new ViewManager(this.applet, this);

        this.time_tracker = new TimeTracker(this.applet, this);

        this._on_day_started_loop();
        this._init_todo_file();
        this._toggle_keybinding();
    },

    _init_todo_file: function () {
        if (this.todo_txt_file_path === '') {
            this.show_view__no_todo_file();
            return;
        }
        else this.show_view__loading();

        try {
            this.todo_txt_file = Gio.file_new_for_path(
                this.todo_txt_file_path.replace(/^.+?\/\//, ''));

            if (! this.todo_txt_file.query_exists(null))
                this.cache_file.create(Gio.FileCreateFlags.NONE, null);

            if (this.todo_file_monitor)
                this.todo_file_monitor.cancel();

            this.todo_file_monitor =
                this.todo_txt_file.monitor_file(Gio.FileMonitorFlags.NONE, null);

            this.todo_file_monitor_connect_id = this.todo_file_monitor.connect(
                'changed', Lang.bind(this, this._on_todo_file_changed));
        }
        catch (e) {
            global.logError(e);
        }

        this.tasks = [];
        this.tasks_scroll_content.remove_all_children();
        this.priorities.clear();
        this.contexts.clear();
        this.projects.clear();

        let [, lines] = this.todo_txt_file.load_contents(null);
        lines = String(lines).trim().split(/\n|\r/);

        this._create_task_objects(lines, () => {
            this._update_panel_item_label();
            this._update_clear_icon();
            this._update_sort_icon();
            this._update_filters();
            this._sort_tasks();
            this.show_view__default();
        });
    },

    _store_cache: function () {
        if (! this.cache_file.query_exists(null))
            this.cache_file.create(Gio.FileCreateFlags.NONE, null);

        this.cache_file.replace_contents(JSON.stringify(this.cache), null, false,
            Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    },

    _write_tasks_to_file: function () {
        this.file_monitor_handler_block = true;

        let res = '';

        let len = this.tasks.length;
        for (let i = 0; i < len; i++) res += this.tasks[i].task_str + '\n';

        if (! this.todo_txt_file.query_exists(null))
            this.cache_file.create(Gio.FileCreateFlags.NONE, null);

        this.todo_txt_file.replace_contents(res, null, false,
            Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    },

    _on_todo_file_changed: function (a, b, c, event_type) {
        // @HACK
        // The normal handler_block/unblock methods don't work with a file
        // monitor for some reason. This seems to work well enough.
        if (this.file_monitor_handler_block) {
            Mainloop.idle_add(() => {
                this.file_monitor_handler_block = false;
            });
            return;
        }

        if (event_type !== undefined &&
            event_type !== Gio.FileMonitorEvent.CHANGES_DONE_HINT)
            return;

        this._init_todo_file();
    },

    _update_panel_item_label: function () {
        let n_complete   = this.priorities.get('(x)') || 0;
        let n_hidden     = this.priorities.get('(~)') || 0;
        let n_incomplete = this.tasks.length - n_complete - n_hidden;
        this.panel_item.set_label('' + n_incomplete);

        if (n_incomplete) this.panel_item.actor.remove_style_class_name('done');
        else this.panel_item.actor.add_style_class_name('done');
    },

    _update_clear_icon: function () {
        this.clear_button.visible = this.priorities.has('(x)');
    },

    _update_sort_icon: function () {
        if (this.cache.sort.sort_order === SortOrder.ASCENDING)
            ICON_FROM_URI.icon_from_uri(this.sort_icon, CustomIcon.SORT_ASCENDING, this.metadata);
        else
            ICON_FROM_URI.icon_from_uri(this.sort_icon, CustomIcon.SORT_DESCENDING, this.metadata);
    },

    _update_filter_icon: function () {
        if (this.has_active_filters())
            this.filter_button.add_style_class_name('active');
        else
            this.filter_button.remove_style_class_name('active');
    },

    show_view__no_todo_file: function () {
        this.view_manager.show_view({
            view_name      : View.NO_TODO_FILE,
            actors         : [this.no_todo_file_msg],
            focused_actor  : this.no_todo_file_msg,
            close_callback : () => { this.no_todo_file_msg.hide(); },
        });
    },

    show_view__loading: function () {
        ICON_FROM_URI.icon_from_uri(
            this.panel_item.icon, CustomIcon.TODO_LOADING, this.metadata);

        this.view_manager.show_view({
            view_name      : View.LOADING,
            actors         : [this.loading_msg],
            focused_actor  : this.loading_msg,
            close_callback : () => {
                this.loading_msg.hide();
                this._update_panel_icon_name();
            },
        });
    },

    show_view__default: function () {
        this.view_manager.show_view({
            view_name      : View.DEFAULT,
            actors         : [this.header, this.tasks_scroll],
            focused_actor  : this.add_task_button,
            close_callback : () => {
                this.header.hide();
                this.tasks_scroll.hide();
            },
        });
    },

    show_view__clear_completed: function () {
        let box = new ClearCompletedTasks(this.applet, this);

        this.view_manager.show_view({
            view_name      : View.CLEAR,
            actors         : [box.actor],
            focused_actor  : box.button_cancel,
            close_callback : () => { box.actor.destroy(); },
        });

        box.connect('delete-all', () => {
            let res = [];

            for (let i = 0, len = this.tasks.length; i < len; i++)
                if (this.tasks[i].priority !== '(x)')
                    res.push(this.tasks[i]);

            this.tasks = res;
            this.priorities.delete('(x)');
            this._update_clear_icon();
            this._write_tasks_to_file();
            this._add_tasks_to_menu(true);

            this.show_view__default();
        });

        box.connect('archive-all', () => {
            let incomplete = [];
            let complete   = [];

            for (let i = 0, len = this.tasks.length; i < len; i++) {
                if (this.tasks[i].priority !== '(x)')
                    incomplete.push(this.tasks[i]);
                else
                    complete.push(this.tasks[i].task_str);
            }

            try {
                let done_txt_file = Gio.file_new_for_path(
                    this.done_txt_file_path.replace(/^.+?\/\//, ''));

                if (! done_txt_file.query_exists(null))
                    done_txt_file.create(Gio.FileCreateFlags.NONE, null);

                let append_stream = done_txt_file.append_to(
                    Gio.FileCreateFlags.NONE, null);

                append_stream.write_all(complete.join('\n'), null);
            }
            catch (e) { global.logError(e); }

            this.tasks = incomplete;
            this.priorities.delete('(x)');
            this._update_clear_icon();
            this._write_tasks_to_file();
            this._add_tasks_to_menu(true);

            this.show_view__default();
        });

        box.connect('cancel', () => {
            this.show_view__default();
        });
    },

    show_view__time_tracker_stats: function (task) {
        let stats;

        if (task) {
            stats = this.time_tracker.get_stats(task.task_str);
            if (stats) stats = [stats];
        }
        else stats = this.time_tracker.get_all_project_stats();

        let stat_view = new TimeTrackerStatView(this.applet, this, stats);

        this.view_manager.show_view({
            view_name      : View.STATS,
            actors         : [stat_view.actor],
            focused_actor  : stat_view.close_button,
            close_callback : () => { stat_view.actor.destroy(); },
        });

        stat_view.connect('close', () => {
            this.show_view__default();
        });
    },

    show_view__search: function () {
        if (this.add_tasks_to_menu_proc_id) {
            Mainloop.source_remove(this.add_tasks_to_menu_proc_id);
            this.add_tasks_to_menu_proc_id = null;
        }

        this.view_manager.show_view({
            view_name      : View.SEARCH,
            actors         : [this.search_entry_bin, this.tasks_scroll],
            focused_actor  : this.search_entry,
            close_callback : () => {
                this.search_entry.set_text('');
                this.search_dictionary.clear();
                this.search_entry_bin.hide();
                this.tasks_scroll.hide();
                this._add_tasks_to_menu(true);
            },
        });

        // We always search all tasks no matter what filters are active, so
        // render all tasks when we show the search.
        this._add_tasks_to_menu(true, true);
    },

    show_view__sort: function () {
        let sort_window = new TaskSortWindow(this.applet, this);

        this.view_manager.show_view({
            view_name      : View.SELECT_SORT,
            actors         : [sort_window.actor],
            focused_actor  : sort_window.button_ok,
            close_callback : () => { sort_window.actor.destroy(); },
        });

        sort_window.connect('update-sort', (_, new_sort_obj) => {
            this.cache.sort = new_sort_obj;
            this._store_cache();
            this._sort_tasks();
            this.show_view__default();
        });
    },

    show_view__filters: function () {
        let filters_window = new TaskFiltersWindow(this.applet, this);

        this.view_manager.show_view({
            view_name      : View.SELECT_FILTER,
            actors         : [filters_window.actor],
            focused_actor  : filters_window.button_ok,
            close_callback : () => { filters_window.actor.destroy(); },
        });

        filters_window.connect('update-filters', (_, new_filters) => {
            this.change_filter_object(new_filters);
            this.show_view__default();
        });
    },

    show_view__task_editor: function (task) {
        let editor = new TaskEditor(this.applet, this, task);

        this.view_manager.show_view({
            view_name      : View.EDITOR,
            actors         : [editor.actor],
            focused_actor  : editor.entry.entry,
            close_callback : () => { editor.actor.destroy(); },
        });

        if (task) this.time_tracker.stop_tracking(task);

        editor.connect('edit-task', (_, task_str) => {
            let start = Date.now();
            let was_hidden   = task.hidden;
            let old_task_str = task.task_str;
            let old_priority = task.priority;
            let old_contexts = task.contexts;
            let old_projects = task.projects;

            let it, i, n;

            task.update_task(task_str);

            // Decrement the global count of this priority or remove it if no
            // other task has it.
            if (! was_hidden) {
                n = this.priorities.get(old_priority);
                if (n > 1) this.priorities.set(old_priority, --n);
                else this.priorities.delete(old_priority);
            }

            // We don't want to add the priority to global statistics if the
            // task is hidden.
            if (! task.hidden) {
                n = this.priorities.get(task.priority);
                this.priorities.set(task.priority, n ? ++n : 1);
            }

            // Decrement the global count of new contexts/projects that have
            // been removed during the edit or remove them if no other tasks
            // have them.
            i = old_contexts.length;
            while (i--) {
                it = old_contexts[i];

                if (task.contexts.indexOf(it) === -1) {
                    n = this.contexts.get(it);
                    if (n > 1) this.contexts.set(it, --n);
                    else this.contexts.delete(it);
                }
            }

            i = old_projects.length;
            while (i--) {
                it = old_projects[i];

                if (task.projects.indexOf(it) === -1) {
                    n = this.projects.get(it);
                    if (n > 1) this.projects.set(it, --n);
                    else this.projects.delete(it);
                }
            }

            // Increment the global count of new contexts/projects that have
            // been added during the edit or add them if they don't exist.
            i = task.contexts.length;
            while (i--) {
                it = task.contexts[i];

                if (old_contexts.indexOf(it) === -1) {
                    n = this.contexts.get(it);
                    this.contexts.set(it, n ? ++n : 1);
                }
            }

            i = task.projects.length;
            while (i--) {
                it = task.projects[i];

                if (old_projects.indexOf(it) === -1) {
                    n = this.projects.get(it);
                    this.projects.set(it, n ? ++n : 1);
                }
            }

            this.time_tracker.update_record_name(old_task_str, task.task_str);
            this._update_filters();
            this._sort_tasks();
            this._update_panel_item_label();
            this._update_clear_icon();
            this._write_tasks_to_file();

            this.show_view__default();
        });

        editor.connect('delete-task', (_, do_archive) => {
            // Decrement number of tasks with this priority/context/project,
            // or remove the entry from the global vars if no other tasks
            // have them.
            if (! task.hidden) {
                let i, n;

                // priorities
                n = this.priorities.get(task.priority);
                if (n > 1) this.priorities.set(task.priority, --n);
                else       this.priorities.delete(task.priority);

                // contexts
                i = task.contexts.length;
                while (i--) {
                    it = task.contexts[i];

                    if (task.contexts.indexOf(it) === -1) {
                        n = this.contexts.get(it);
                        if (n > 1) this.contexts.set(it, --n);
                        else this.contexts.delete(it);
                    }
                }

                // projects
                i = task.projects.length;
                while (i--) {
                    it = task.projects[i];

                    if (task.projects.indexOf(it) === -1) {
                        n = this.projects.get(it);
                        if (n > 1) this.projects.set(it, --n);
                        else this.projects.delete(it);
                    }
                }
            }

            // delete task object
            i = this.tasks.length;
            while (i--) {
                if (this.tasks[i].task_str === task.task_str)
                    this.tasks.splice(i, 1);
            }

            if (do_archive && this.done_txt_file_path) {
                try {
                    let done_txt_file = Gio.file_new_for_path(
                        this.done_txt_file_path.replace(/^.+?\/\//, ''));

                    if (! done_txt_file.query_exists(null))
                        done_txt_file.create(Gio.FileCreateFlags.NONE, null);

                    let append_stream = done_txt_file.append_to(
                        Gio.FileCreateFlags.NONE, null);

                    append_stream.write_all(task.task_str, null);
                }
                catch (e) { global.logError(e); }
            }

            this._update_filters();
            this._sort_tasks();
            this._update_panel_item_label();
            this._update_clear_icon();
            this._write_tasks_to_file();

            this.show_view__default();
        });

        editor.connect('add-task', (_, task_str) => {
            this._add_task(task_str, this.tasks);
            this.tasks.unshift(this.tasks.pop());

            this._update_filters();
            this._sort_tasks();
            this._update_panel_item_label();
            this._update_clear_icon();
            this._write_tasks_to_file();

            this.show_view__default();
        });

        editor.connect('cancel', () => {
            this.show_view__default();
        });
    },

    // @task_str: string (a single line in the todo.txt file)
    _add_task: function (task_str) {
        if (task_str.trim() === '') return;

        let task = new TaskItem(this.applet, this, task_str);
        this.tasks.push(task);

        // Store any priorities, contexts, or projects into the global vars.
        let i, it;

        i = task.projects.length;
        while (i--) {
            it = this.projects.get(task.projects[i]);
            this.projects.set(task.projects[i], it ? ++it : 1);
        }

        i = task.contexts.length;
        while (i--) {
            it = this.contexts.get(task.contexts[i]);
            this.contexts.set(task.contexts[i], it ? ++it : 1);
        }

        it = this.priorities.get(task.priority);
        this.priorities.set(task.priority, it ? ++it : 1);
    },

    // Create objects from the todo_txt file, and add them to the task_objects
    // array.
    //
    // @todo_txt: array (of strings, each string is a line in todo.txt file)
    // @callback: func
    _create_task_objects: function (todo_txt, callback) {
        if (this.add_tasks_to_menu_proc_id) {
            Mainloop.source_remove(this.add_tasks_to_menu_proc_id);
            this.add_tasks_to_menu_proc_id = null;
        }

        let n = Math.min(todo_txt.length, 21);

        for (var i = 0; i < n; i++)
            this._add_task(todo_txt[i]);

        this.create_tasks_proc_id = Mainloop.idle_add(() => {
            this._create_task_objects__finish(i, todo_txt, callback);
        });
    },

    _create_task_objects__finish: function (i, todo_txt, callback) {
        if (i === todo_txt.length) {
            this.create_tasks_proc_id = null;
            if (typeof(callback) === 'function') callback();
            return;
        }

        this._add_task(todo_txt[i]);

        this.create_tasks_proc_id = Mainloop.idle_add_full(Mainloop.PRIORITY_LOW,
            () => {
                this._create_task_objects__finish(++i, todo_txt, callback);
            });
    },

    // @update_tasks_viewport: bool
    // @ignore_filters:  bool
    //
    // This is the only function that can add task actors to the popup menu.
    //
    // If @update_tasks_viewport is true, then the tasks viewport will be
    // reubuil (i.e., all tasks will be run through the filter test again.)
    //
    //  @ignore_filters only makes sense if @update_tasks_viewport is true.
    _add_tasks_to_menu: function (update_tasks_viewport, ignore_filters) {
        update_tasks_viewport = !! update_tasks_viewport;
        ignore_filters        = !! ignore_filters;

        if (this.add_tasks_to_menu_proc_id) {
            Mainloop.source_remove(this.add_tasks_to_menu_proc_id);
            this.add_tasks_to_menu_proc_id = null;
        }

        this.tasks_scroll.get_vscroll_bar().get_adjustment().set_value(0);
        this.tasks_scroll_content.remove_all_children();
        if (update_tasks_viewport) this.tasks_viewport = [];

        let arr = update_tasks_viewport ? this.tasks : this.tasks_viewport;
        let n   = Math.min(arr.length, 21);

        for (let i = 0; i < n; i++) {
            if (update_tasks_viewport) {
                if (ignore_filters || this._filter_test(arr[i])) {
                    this.tasks_viewport.push(arr[i]);
                    this.tasks_scroll_content.add_child(arr[i].actor);
                }
            }
            else this.tasks_scroll_content.add_child(arr[i].actor);

            arr[i].actor.visible = this.applet.menu.isOpen &&
                                   this.tasks_scroll.visible;
        }

        this.add_tasks_to_menu_proc_id = Mainloop.idle_add(() => {
           this._add_tasks_to_menu__finish(n, arr, update_tasks_viewport, ignore_filters);
        });
    },

    _add_tasks_to_menu__finish: function (i, arr, update_tasks_viewport, ignore_filters) {
        if (i === arr.length) {
            this.add_tasks_to_menu_proc_id = null;
            return;
        }

        if (update_tasks_viewport) {
            if (ignore_filters || this._filter_test(arr[i])) {
                this.tasks_viewport.push(arr[i]);
                this.tasks_scroll_content.add_child(arr[i].actor);
            }
        }
        else this.tasks_scroll_content.add_child(arr[i].actor);

        arr[i].actor.visible = this.applet.menu.isOpen &&
                               this.tasks_scroll.visible;

        this.add_tasks_to_menu_proc_id = Mainloop.idle_add(() => {
            this._add_tasks_to_menu__finish(++i, arr, update_tasks_viewport, ignore_filters);
        });
    },

    // @task: obj (a task object)
    //
    // If invert_filters is false, return true if at least one filter is matched.
    // If invert_filters is true, return false if at least one filter is matched.
    _filter_test: function (task) {
        if (! this.cache.filters.show_hidden) {
            if (task.hidden) return false;
        }
        else return task.hidden;

        if (! this.has_active_filters()) return true;

        let i, arr;

        arr = this.cache.filters.active_filters.priorities;
        i = arr.length;
        while (i--)
            if (arr[i] === task.priority)
                return !this.cache.filters.invert_filters;

        arr = this.cache.filters.active_filters.contexts;
        i = arr.length;
        while (i--)
            if (task.contexts.indexOf(arr[i]) !== -1)
                return !this.cache.filters.invert_filters;

        arr = this.cache.filters.active_filters.projects;
        i = arr.length;
        while (i--)
            if (task.projects.indexOf(arr[i]) !== -1)
                return !this.cache.filters.invert_filters;

        arr = this.cache.filters.active_filters.custom;
        i = arr.length;
        while (i--)
            if (FUZZ.fuzzy_search_v1(arr[i], task.task_str) !== null)
                return !this.cache.filters.invert_filters;

        return this.cache.filters.invert_filters;
    },

    // Returns true if there are any active filters, else false.
    has_active_filters: function () {
        if (this.cache.filters.active_filters.priorities.length ||
            this.cache.filters.active_filters.contexts.length   ||
            this.cache.filters.active_filters.projects.length   ||
            this.cache.filters.active_filters.custom.length     ||
            this.cache.filters.show_hidden) {

            return true;
        }

        return false;
    },

    // Check if there are any redundant active filters and remove them.
    _update_filters: function () {
        let i, arr;

        arr = this.cache.filters.active_filters.priorities;
        i = arr.length;
        while (i--) if (! this.priorities.has(arr[i])) arr.splice(i, 1);

        arr = this.cache.filters.active_filters.contexts;
        i = arr.length;
        while (i--) if (! this.contexts.has(arr[i])) arr.splice(i, 1);

        arr = this.cache.filters.active_filters.projects;
        i = arr.length;
        while (i--) if (! this.projects.has(arr[i])) arr.splice(i, 1);

        this._update_filter_icon();
    },

    // @new_filters: obj (An obj with same properties as this.cache.filters.)
    //
    // Replace the entire filters obj in this.cache.filters with @new_filters.
    change_filter_object: function (new_filters) {
        this.cache.filters = new_filters;
        this._store_cache();
        this._update_filter_icon();
        this._add_tasks_to_menu(true);
    },

    // @keyword: string (A priority, context, or project.)
    //
    // Add keyword as new active filter if it doesn't exist already.
    activate_filter: function (keyword) {
        if (REG_PRIO.test(keyword))
            var arr = this.cache.filters.active_filters.priorities;
        else if (REG_CONTEXT.test(keyword))
            var arr = this.cache.filters.active_filters.contexts;
        else if (REG_PROJ.test(keyword))
            var arr = this.cache.filters.active_filters.projects;

        if (arr.indexOf(keyword) !== -1) return;

        arr.push(keyword);
        this._store_cache();

        this._update_filter_icon();
        if (this.view_manager.current_view === View.DEFAULT) this._add_tasks_to_menu(true);
    },

    _sort_tasks: function () {
        let compare_func;
        let k;

        switch (this.cache.sort.sort_type) {
            case SortType.PRIORITY: {
                if (this.cache.sort.sort_order === SortOrder.DESCENDING)
                    compare_func = (a, b) => +(a.priority   > b.priority) ||
                                             +(a.priority === b.priority) - 1;
                else
                    compare_func = (a, b) => +(a.priority   < b.priority) ||
                                             +(a.priority === b.priority) - 1;
                break;
            }

            case SortType.CREATION_DATE:   if (!k) k = 'creation_date';
            case SortType.COMPLETION_DATE: if (!k) k = 'completion_date';
            case SortType.DUE_DATE:        if (!k) k = 'due_date';
            case '': {
                if (this.cache.sort.sort_order === SortOrder.DESCENDING)
                    compare_func = (a, b) => +(a[k] < b[k]) || +(a[k] === b[k]) - 1;
                else
                    compare_func = (a, b) => +(a[k] > b[k]) || +(a[k] === b[k]) - 1;

                break;
            }

            default: return;
        }

        this.tasks.sort(compare_func);

        this._add_tasks_to_menu(true);
        this._update_sort_icon();
    },

    // Each search query and the corresponding array of results (task objects)
    // is stored in a dictionary. If the current search query is in the dict, we
    // just use the corresponding results. If a search query in the dict is a
    // prefix of the current search query, we execute a search on the results
    // of the prefix query (search space reduced.)
    //
    // The dictionary is only maintained for the duration of the search.
    _search: function () {
        if (this.view_manager.current_view !== View.SEARCH)
            return;

        if (this.add_tasks_to_menu_proc_id) {
            Mainloop.source_remove(this.add_tasks_to_menu_proc_id);
            this.add_tasks_to_menu_proc_id = null;
        }

        let pattern = this.search_entry.text.trim().toLowerCase();

        if (pattern === '') {
            this.last_search_pattern = '';
            this.tasks_viewport = this.tasks;
            this._add_tasks_to_menu();
            return;
        }

        this.last_search_pattern = pattern;
        let [search_needed, search_space] = this._find_prev_search_results(pattern);

        if (! search_needed) {
            this.tasks_viewport = search_space;
            this._add_tasks_to_menu();
            return;
        }

        this._do_search(pattern, search_space);
    },

    _do_search: function (pattern, search_space) {
        this.tasks_viewport = [];

        let reduced_results = [];
        let score;
        let i = search_space.length;

        while (i--) {
            score = FUZZ.fuzzy_search_v1(pattern, search_space[i].task_str.toLowerCase());
            if (score === null) continue;
            reduced_results.push({idx: i, score: score});
        }

        reduced_results.sort((a, b) => b.score - a.score);

        i = reduced_results.length;
        while (i--)
            this.tasks_viewport[i] = search_space[reduced_results[i].idx];

        this.search_dictionary.set(pattern, this.tasks_viewport);
        this._add_tasks_to_menu();
    },

    // returns [search_needed, search_space]
    // search_needed: bool
    // search_space:  array (of task objects)
    _find_prev_search_results: function (pattern) {
        let res = '';

        for (let [old_patt,] of this.search_dictionary.entries())
            if (pattern.startsWith(old_patt) && old_patt.length > res.length)
                res = old_patt;

        if (pattern === res) return [false, this.search_dictionary.get(res)];
        else if (res)        return [true,  this.search_dictionary.get(res)];
        else                 return [true,  this.tasks];
    },

    on_task_checkbox_clicked: function (old_prio, task) {
        // Update the global metadata vars
        let old_n = this.priorities.get(old_prio);
        if (old_n > 1) this.priorities.set(old_prio, --old_n);
        else           this.priorities.delete(old_prio);

        let new_n = this.priorities.get(task.priority);
        this.priorities.set(task.priority, new_n ? ++new_n : 1);

        this._update_filters();
        this._sort_tasks();
        this._update_panel_item_label();
        this._update_clear_icon();
        this._write_tasks_to_file();
    },

    _on_day_started_loop: function () {
        if (this.on_day_started_loop_id) return;

        //
        // put stuff here to execute immediately on invocation (and each time
        // the applet is reloaded.)
        //
        let d = new Date();
        let t = 86400 - Math.round((d.getTime() - d.setHours(0,0,2,0)) / 1000);

        this.on_day_started_loop_id = Mainloop.timeout_add_seconds(t, () => {
            //
            // We only emit here, or else we will emit every time the applet
            // gets reloaded. In that case it couldn't be used by functions
            // that deal with persistent data. On the other hand, this may never
            // execute if the applet is removed before midnight and added back
            // after.
            //
            this.emit('new-day');


            // Update all due dates.
            let i = this.tasks.length;
            while (i--) this.tasks[i].update_due_date();


            //
            // reset
            //
            this.on_day_started_loop_id = null;
            this._on_day_started_loop();
        });
    },

    _update_panel_icon_name: function() {
        ICON_FROM_URI.icon_from_uri(this.panel_item.icon, this.todo_icon, this.metadata);

        // If the path was relative the icon_from_uri will convert it to
        // absolute. We update the todo_icon in order to not have a broken
        // icon in the applet gtk settings window.
        this.todo_icon = this.panel_item.icon.get_gicon().to_string();
    },

    _update_task_width: function () {
        let i = this.tasks.length;
        while (i--) this.tasks[i].actor.width = this.task_width;
    },

    // Try to update the markup_color object. Returns true if the object has been
    // updated; otherwise, false.
    _update_markup_colors: function () {
        let update_needed = false;

        ['context', 'project', 'link'].forEach((it) => {
            let [success, col] = this.actor.get_theme_node()
                                           .lookup_color(it + '-color', false);

            if (success) {
                col = col.to_string().substr(0, 7);

                if (this.markup_colors[it] !== col) {
                    this.markup_colors[it] = col;
                    update_needed = true;
                }
            }
        });

        if (update_needed) {
            let i = 0;

            for (; i < 30; i++) this.tasks[i].update_task();

            Mainloop.idle_add(() => {
                for (let len = this.tasks.length; i < len; i++)
                    this.tasks[i].update_task();
            });
        }
    },

    _toggle_panel_mode: function () {
        if (this.panel_mode === 0) this.panel_item.set_mode('icon');
        else if (this.panel_mode === 1) this.panel_item.set_mode('text');
        else this.panel_item.set_mode('icon_text');
    },

    _toggle_keybinding: function () {
        Main.keybindingManager.removeHotKey("todo_open");
        Main.keybindingManager.removeHotKey("todo_open_to_add");
        Main.keybindingManager.removeHotKey("todo_open_to_search");

        if (this.cache.enabled) {
            if (this.key_open !== '') {
                Main.keybindingManager.addHotKey(
                    "todo_open",
                    this.key_open,
                    () => {
                        this.applet.open_menu(this);
                        if (this.view_manager.current_view !== View.LOADING &&
                            this.view_manager.current_view !== View.NO_TODO_FILE) {

                            this.show_view__default();
                        }
                    });
            }

            if (this.key_open_to_add !== '') {
                Main.keybindingManager.addHotKey(
                    "todo_open_to_add",
                    this.key_open_to_add,
                    () => {
                        this.applet.open_menu(this);
                        if (this.view_manager.current_view !== View.LOADING &&
                            this.view_manager.current_view !== View.NO_TODO_FILE) {

                            this.show_view__task_editor();
                        }
                    });
            }

            if (this.key_open_to_search !== '') {
                Main.keybindingManager.addHotKey(
                    "todo_open_to_search",
                    this.key_open_to_search,
                    () => {
                        this.applet.open_menu(this);
                        if (this.view_manager.current_view !== View.LOADING &&
                            this.view_manager.current_view !== View.NO_TODO_FILE) {

                            this.show_view__search();
                        }
                    });
            }
        }
    },

    // This method will be called by applet.js after the section has been
    // enabled/disabled.
    toggle_section: function () {
        this._store_cache();
        if (this.cache.enabled) this._init__later();
        else                    this._shutdown_section();
    },

    // This method will be called by applet.js after the section has been
    // removed from the panel.
    on_applet_removed_from_panel: function () {
        this._shutdown_section();
    },

    _shutdown_section: function () {
        this._toggle_keybinding();
        this.todo_file_monitor.cancel();

        if (this.create_task_objects_proc_id) {
            Mainloop.source_remove(this.create_task_objects_proc_id);
            this.create_task_objects_proc_id = null;
        }

        if (this.add_tasks_to_menu_proc_id) {
            Mainloop.source_remove(this.add_tasks_to_menu_proc_id);
            this.add_tasks_to_menu_proc_id = null;
        }

        if (this.on_day_started_loop_id) {
            Mainloop.source_remove(this.on_day_started_loop_id);
            this.on_day_started_loop_id = null;
        }

        if (this.time_tracker) {
            this.time_tracker.close();
            this.time_tracker = null;
        }

        if (this.view_manager) this.view_manager = null;
    },
};
Signals.addSignalMethods(Todo.prototype);



// =====================================================================
// @@@ The window used for adding/editing a task.
//
// @applet:   obj (actual applet object)
// @delegate: obj (main object)
// @task:     obj (optional)
//
// @signals:
//   - 'add-task'    (returns task string)
//   - 'edit-task'   (returns task string)
//   - 'delete-task'
//   - 'cancel'
//
// If @task is provided, then the entry will be prepopulated with the task_str.
// =====================================================================
function TaskEditor (applet, delegate, task) {
   this._init(applet, delegate, task);
}

TaskEditor.prototype = {
    _init: function (applet, delegate, task) {
        this.applet   = applet;
        this.delegate = delegate;

        this.curr_selected_completion   = null;
        this.current_word_start         = 0;
        this.current_word_end           = 0;
        this.text_changed_handler_block = false;


        // One of: 'edit-task', 'add-task'.
        this.mode = task ? 'edit-task' : 'add-task';


        //
        // draw
        //
        this.actor = new St.Bin({ x_fill: true, style_class: 'view-box popup-menu-item' });

        this.content_box = new St.BoxLayout({ x_expand: true, vertical: true, style_class: 'view-box-content menu-favorites-box' });
        this.actor.add_actor(this.content_box);


        //
        // entry
        //
        this.entry_container = new St.BoxLayout({ vertical: true, style_class: 'popup-menu-item entry-container' });
        this.content_box.add_child(this.entry_container);

        this.entry = new MULTIL_ENTRY.MultiLineEntry(I18N._('Task...'), true, true);
        this.entry_container.add_actor(this.entry.actor);
        // enable scrolling by grabbing handle with the mouse
        this.entry.scroll_box.vscroll.connect('scroll-start', () => { applet.menu.passEvents = true; });
        this.entry.scroll_box.vscroll.connect('scroll-stop', () => { applet.menu.passEvents = false; });

        if (this.mode === 'edit-task') {
            this.text_changed_handler_block = true;

            Meta.later_add(Meta.LaterType.BEFORE_REDRAW, () => {
                this.entry.entry.set_text(task.task_str);
                this.entry._resize_entry();
                this.text_changed_handler_block = false;
            });
        }


        //
        // used to show project/context completions
        //
        this.completion_menu = new St.ScrollView({ visible: false });

        if (this.applet.orientation === St.Side.BOTTOM)
            this.entry_container.insert_child_below(this.completion_menu,
                                                    this.entry.actor);
        else
            this.entry_container.add_child(this.completion_menu);

        this.completion_menu_content = new St.BoxLayout({ vertical: true, reactive: true, style_class: 'completion-box view-box-content menu-favorites-box' });
        this.completion_menu.add_actor(this.completion_menu_content);


        //
        // buttons
        //
        this.btn_box = new St.BoxLayout({ style_class: 'popup-menu-item btn-box' });
        this.content_box.add_actor(this.btn_box);

        if (this.mode === 'edit-task') {
            this.button_delete = new St.Button({ can_focus: true, label: I18N._('Delete'), style_class: 'btn-delete button notification-icon-button modal-dialog-button', x_expand: true });
            this.btn_box.add(this.button_delete, {expand: true});
            this.button_delete.connect('clicked', () => this.emit('delete-task'));
        }

        if (this.mode === 'edit-task' && task.priority === '(x)') {
            this.button_archive = new St.Button({ can_focus: true, label: I18N._('Archive'), style_class: 'btn-delete button notification-icon-button modal-dialog-button', x_expand: true });
            this.btn_box.add(this.button_archive, {expand: true});
            this.button_archive.connect('clicked', () => this.emit('delete-task', true));
        }

        this.button_cancel = new St.Button({ can_focus: true, label: I18N._('Cancel'), style_class: 'btn-cancel button notification-icon-button modal-dialog-button', x_expand: true });
        this.btn_box.add(this.button_cancel, {expand: true});

        this.button_ok = new St.Button({ can_focus: true, label: I18N._('Ok'), style_class: 'btn-ok button notification-icon-button modal-dialog-button', x_expand: true });
        this.btn_box.add(this.button_ok, {expand: true});


        //
        // listen
        //
        this.button_ok.connect('clicked', () => {
            this.emit(this.mode, this._create_task_str());
        });
        this.button_cancel.connect('clicked', () => {
           this.emit('cancel');
        });
        this.entry.entry.clutter_text.connect('text-changed', () => {
            if (this.text_changed_handler_block)
                return Clutter.EVENT_PROPAGATE;

            Mainloop.idle_add(() => {
                let word = this._get_current_word();
                if (word) this._show_completions(word);
                else this.completion_menu.hide();
            });
        });
        this.applet.connect('orientation-changed', (_, orientation) => {
            this._on_orientation_changed(orientation);
        });
        this.entry.entry.connect('key-press-event', (_, event) => {
            let symbol = event.get_key_symbol();

            if (this.completion_menu.visible && symbol === Clutter.Tab) {
                this._on_tab();
                return Clutter.EVENT_STOP;
            }
        });
        this.entry.entry.clutter_text.connect('activate', () => {
            if (this.completion_menu.visible) this._on_completion_selected();
        });
    },

    // @word: string (a context or project)
    _show_completions: function (word) {
        let completions = [];

        if (word[0] === '@')
            completions = this._find_completions(word, this.delegate.contexts);
        else if (word[0] === '+')
            completions = this._find_completions(word, this.delegate.projects);


        if (completions.length === 0) {
            this.completion_menu.hide();
        }
        else {
            this.completion_menu_content.remove_all_children();
            this.completion_menu.show();

            for (let i = 0; i < completions.length; i++)  {
                let item = new St.Button({ label: completions[i], reactive: true, track_hover: true, x_align: St.Align.START, style_class: 'completion-item popup-menu-item' });
                this.completion_menu_content.add_child(item);

                item.connect('notify::hover', (item) => {
                    this._on_completion_hovered(item);
                });
                item.connect('clicked', (item) => {
                    this._on_completion_selected();
                });
            }
        }

        this.completion_menu_content.first_child.pseudo_class = 'active';
        this.curr_selected_completion = this.completion_menu_content.first_child;
    },

    // @needle:   string (a context or project)
    // @haystack: map    (of all contexts or projects);
    // If @needle is a context, then the @haystack has to be the map of all
    // contexts. Likewise for projects.
    _find_completions: function (needle, haystack) {
        if (needle === '@' || needle === '+') {
            let res = [];
            for (let [key,] of haystack.entries()) res.push(key);
            return res;
        }

        let reduced_results = [];

        let score;
        for (let [keyword,] of haystack.entries()) {
            score = FUZZ.fuzzy_search_v1(needle, keyword);
            if (!score) continue;
            reduced_results.push({keyword: keyword, score: score });
        }

        reduced_results.sort((a, b) => a.score < b.score);

        let results = [];

        for (let i = 0, len = reduced_results.length; i < len; i++) {
            results[i] = reduced_results[i].keyword;
        }

        return results;
    },

    // Get the word that the cursor is currently on or null if the word is not
    // a context/project.
    _get_current_word: function () {
        let text = this.entry.entry.text;

        let pos = this.entry.entry.clutter_text.cursor_position;

        if (pos === -1) pos = text.length;

        if (pos === 0 || /\s/.test(text[pos - 1])) return null;

        if (pos === text.length || /\s/.test(text[pos])) pos--;

        let start = pos;
        while (text[start] !== ' ' && start > 0) start--;

        let end = pos;
        while (text[end] !== ' ' && end !== text.length + 1) end++;

        if (text[start] === ' ') start++;
        if (text[end] === ' ') end--;

        let word = text.substring(start, ++end);

        this.current_word_start = start;
        this.current_word_end   = end;

        if (/[@+]/.test(word) || REG_CONTEXT.test(word) || REG_PROJ.test(word))
            return word;
        else
            return null;
    },

    _on_tab: function () {
        this.curr_selected_completion.pseudo_class = '';

        let next = this.curr_selected_completion.get_next_sibling();

        if (next) {
            this.curr_selected_completion = next;
            next.pseudo_class = 'active';
        }
        else {
            this.curr_selected_completion = this.completion_menu_content.first_child;
            this.curr_selected_completion.pseudo_class = 'active';
        }

        SCROLL_TO_ITEM.scroll(this.completion_menu,
                              this.completion_menu_content,
                              this.curr_selected_completion);
    },

    _on_completion_selected: function () {
        this.completion_menu.hide();

        let completion = this.curr_selected_completion.label;

        let text = this.entry.entry.text.slice(0, this.current_word_start) +
                   completion +
                   this.entry.entry.text.slice(this.current_word_end);


        this.text_changed_handler_block = true;

        this.entry.entry.clutter_text.text = text;

        // @BUG or feature?
        // Setting the cursor pos directly seeems to also select the text, so
        // use this func instead.
        let p = this.current_word_start + completion.length;
        this.entry.entry.clutter_text.set_selection(p, p);

        this.text_changed_handler_block = false;
    },

    _on_completion_hovered: function (item) {
        this.curr_selected_completion.pseudo_class = '';
        this.curr_selected_completion = item;
        item.pseudo_class = 'active';
    },

    _on_orientation_changed: function (orient) {
        if (orient === St.Side.BOTTOM)
            this.entry_container.set_child_below_sibling(this.completion_menu,
                                                         this.entry.actor);
        else
            this.entry_container.set_child_above_sibling(this.completion_menu,
                                                         this.entry.actor);
    },

    _create_task_str: function () {
        if (this.mode === 'edit-task') return this.entry.entry.get_text();

        // If in add mode, we insert a creation date if the user didn't do it.
        let words = this.entry.entry.get_text().split(/ +/);

        if (words[0] === 'x') {
            if (! REG_DATE.test(words[1]))
                words.splice(1, 0, date_yyyymmdd(), date_yyyymmdd());
            else if (! REG_DATE.test(words[2]))
                words.splice(2, 0, date_yyyymmdd());
        }
        else if (REG_PRIO.test(words[0])) {
            if (! REG_DATE.test(words[1]))
                words.splice(1, 0, date_yyyymmdd());
        }
        else if (! REG_DATE.test(words[0])) {
            words.splice(0, 0, date_yyyymmdd());
        }

        return words.join(' ');
    },
};
Signals.addSignalMethods(TaskEditor.prototype);



// =====================================================================
// @@@ A task object including the actor to be drawn in the popup menu.
//
// @applet:   object (the actual applet objects.)
// @delegate: object (the main object of this section.)
// @task_str: string (a single line in todo.txt file)
// =====================================================================
function TaskItem(applet, delegate, task_str) {
    this._init(applet, delegate, task_str);
}

TaskItem.prototype = {
    _init: function(applet, delegate, task_str) {
        this.applet   = applet;
        this.delegate = delegate;
        this.task_str = task_str;


        // The values of this.priority are:
        // (~) if hidden (x) if completed, (_) if no priority, else (A-Z).
        this.priority        = '(_)';
        this.projects        = [];
        this.contexts        = [];
        this.creation_date   = '9999-99-99'; // use this value if not set
        this.completion_date = '9999-99-99'; // use this value if not set
        this.due_date        = '9999-99-99'; // use this value if not set
        this.hidden          = false;        // h:1 extension


        // used for resizing
        this.msg_vert_padding = -1;
        // Project, context, or url under mouse pointer, null if none of those.
        this.current_keyword = null;


        //
        // container
        //
        this.actor = new St.Bin({ reactive: true, style: 'width: ' + this.delegate.task_width + 'px;', x_fill: true, style_class: 'task-item' });

        this.task_item_content = new St.BoxLayout({ vertical: true, style_class: 'task-item-content' });
        this.actor.add_actor(this.task_item_content);


        //
        // header
        //
        this.header = new St.BoxLayout({ style_class: 'header' });
        this.task_item_content.add_actor(this.header);


        //
        // checkbox
        //
        this.completion_checkbox = new St.Button({ style_class: 'check-box', toggle_mode: true, can_focus: true, y_align: St.Align.MIDDLE });
        this.header.add_child(this.completion_checkbox);

        let checkmark = new St.Bin();
        this.completion_checkbox.add_actor(checkmark);


        //
        // priority label
        //
        this.prio_label = new St.Label({ visible: false, reactive: true, y_align: Clutter.ActorAlign.CENTER, style_class: 'priority-label' });
        this.header.add_child(this.prio_label);


        //
        // due date label
        //
        this.due_date_label = new St.Label({ visible: false, y_align: Clutter.ActorAlign.CENTER, style_class: 'due-date-label' });
        this.header.add_child(this.due_date_label);


        //
        // body
        //
        this.msg = new St.Label({ reactive: true, y_align: Clutter.ActorAlign.CENTER, x_align: St.Align.START, style_class: 'description'});
        this.task_item_content.add_child(this.msg);

        if (! task_str) this.msg.hide();

        this.msg.clutter_text.line_wrap      = true;
        this.msg.clutter_text.ellipsize      = Pango.EllipsizeMode.NONE;
        this.msg.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;


        //
        // date labels (creation/completion/due)
        //
        this.date_labels = new St.Label({ visible: false, y_align: Clutter.ActorAlign.CENTER, x_align: St.Align.START, style_class: 'date-label' });
        this.task_item_content.add_child(this.date_labels);

        this.date_labels.clutter_text.line_wrap      = true;
        this.date_labels.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        this.date_labels.clutter_text.ellipsize      = Pango.EllipsizeMode.NONE;


        //
        // parse task string
        //
        this._parse_task_str();


        //
        // listen
        //
        this.actor.connect('queue-redraw', () => {
            this._resize_msg();
        });
        this.actor.connect('event', (actor, event) => {
            this._on_event(actor, event);
            return Clutter.EVENT_PROPAGATE;
        });
        this.prio_label.connect('leave-event', () => {
            global.unset_cursor();
        });
        this.prio_label.connect('enter-event', () => {
            global.set_cursor(Cinnamon.Cursor.POINTING_HAND);
        });
        this.msg.connect('leave-event', () => {
            global.unset_cursor();
        });
        this.msg.connect('motion-event', (_, event) => {
            this.current_keyword = this._find_keyword(event);
            if (this.current_keyword) global.set_cursor(Cinnamon.Cursor.POINTING_HAND);
            else global.unset_cursor();
        });
        this.completion_checkbox.connect('clicked', () => {
            this._on_checkbox_clicked();
        });
    },

    _show_header_icons: function () {
        if (this.header_icon_box) {
            this.edit_icon_bin.show();

            if (!this.hidden)
                this.stat_icon_bin.show();

            if (!this.hidden && !this.completion_checkbox.checked)
                this.tracker_icon_bin.show();
        }
        else { // @SPEED Lazy load the icons.
            // icon box
            this.header_icon_box = new St.BoxLayout({ x_align: Clutter.ActorAlign.END, style_class: 'option-box' });
            this.header.add(this.header_icon_box, {expand: true});

            // statistic icon
            this.stat_icon_bin = new St.Button({ visible: !this.hidden, can_focus: true, y_align: St.Align.MIDDLE });
            this.header_icon_box.add_actor(this.stat_icon_bin);

            this.stat_icon = new St.Icon();
            this.stat_icon_bin.add_actor(this.stat_icon);
            ICON_FROM_URI.icon_from_uri(this.stat_icon, CustomIcon.GRAPH, this.delegate.metadata);


            // settings icon
            this.edit_icon_bin = new St.Button({ can_focus: true, y_align: St.Align.MIDDLE });
            this.header_icon_box.add_actor(this.edit_icon_bin);

            this.edit_icon = new St.Icon();
            this.edit_icon_bin.add_actor(this.edit_icon);
            ICON_FROM_URI.icon_from_uri(this.edit_icon, CustomIcon.EDIT, this.delegate.metadata);


            // time tracker start button
            this.tracker_icon_bin = new St.Button({ visible: !this.hidden && !this.completion_checkbox.checked, can_focus: true, y_align: St.Align.MIDDLE, style_class: 'tracker-start-icon'});
            this.header_icon_box.add_actor(this.tracker_icon_bin);

            this.tracker_icon = new St.Icon({ icon_name: 'media-playback-start' });
            this.tracker_icon_bin.add_actor(this.tracker_icon);


            // listen
            this.stat_icon_bin.connect('button-press-event', () => {
                this.delegate.show_view__time_tracker_stats(this);
                Mainloop.idle_add(this._hide_header_icons());
            });
            this.stat_icon_bin.connect('key-press-event', (_, event) => {
                if (event.get_key_symbol() === Clutter.Return) {
                    this.delegate.show_view__time_tracker_stats(this);
                    Mainloop.idle_add(this._hide_header_icons());
                }
            });
            this.edit_icon_bin.connect('button-press-event', () => {
                this.delegate.show_view__task_editor(this);
                Mainloop.idle_add(this._hide_header_icons());
            });
            this.edit_icon_bin.connect('key-press-event', (_, event) => {
                if (event.get_key_symbol() === Clutter.Return) {
                    this.delegate.show_view__task_editor(this);
                    Mainloop.idle_add(this._hide_header_icons());
                }
            });
            this.tracker_icon_bin.connect('button-press-event', () => {
                this.delegate.time_tracker.toggle_tracking(this);
                return Clutter.EVENT_STOP;
            });
            this.tracker_icon_bin.connect('key-press-event', (_, event) => {
                if (event.get_key_symbol() === Clutter.Return) {
                    this.delegate.time_tracker.toggle_tracking(this);
                }
            });
        }
    },

    _hide_header_icons: function () {
        this.stat_icon_bin.hide();
        this.edit_icon_bin.hide();
        if (this.tracker_icon_bin.style_class === 'tracker-start-icon')
            this.tracker_icon_bin.hide();
    },

    _toggle_tracker_icon: function () {
        if (this.tracker_icon_bin.style_class === 'tracker-start-icon')
            this._show_tracker_running_icon();
        else
            this._show_tracker_stopped_icon();
    },

    _show_tracker_running_icon: function () {
        this._show_header_icons();
        this.tracker_icon.icon_name       = 'media-playback-pause';
        this.tracker_icon_bin.style_class = 'tracker-pause-icon';
        this.tracker_icon_bin.visible     = true;
        this._hide_header_icons();
    },

    _show_tracker_stopped_icon: function () {
        this.tracker_icon.icon_name       = 'media-playback-start';
        this.tracker_icon_bin.style_class = 'tracker-start-icon';
        this.tracker_icon_bin.visible     = this.edit_icon_bin.visible;
    },

    _parse_task_str: function () {
        let words    = this.task_str.split(/ +/);
        let len      = words.length;
        let desc_pos = 0;

        //
        // Parse the 'header' (everything except the description) and store the
        // offset of the description.
        // desc_pos is the index of the first word of desc in the words array.
        //
        if (words[0] === 'x') {
            this.completion_checkbox.checked = true;
            this.actor.add_style_class_name('completed');
            this.priority = '(x)';

            if (REG_DATE.test(words[1])) {
                this.completion_date = words[1];
                this.date_labels.text += I18N._('completed:') + words[1] + ' ';
                this.date_labels.visible = true;

                if (REG_DATE.test(words[2])) {
                    this.creation_date = words[2];
                    this.date_labels.text += I18N._('created:') + words[2] + ' ';
                    this.date_labels.visible = true;
                    desc_pos = 3;
                }
                else desc_pos = 2;
            }
            else desc_pos = 1;
        }
        else if (REG_PRIO.test(words[0])) {
            this.actor.add_style_class_name(words[0][1]);
            this.prio_label.visible = true;
            this.prio_label.text = words[0];
            this.priority = words[0];

            if (REG_DATE.test(words[1])) {
                this.creation_date = words[1];
                this.date_labels.text += I18N._('created:') + words[1] + ' ';
                this.date_labels.visible = true;
                desc_pos = 2;
            }
            else desc_pos = 1;
        }
        else if (REG_DATE.test(words[0])) {
            this.creation_date = words[0];
            this.date_labels.text += I18N._('created:') + words[0] + ' ';
            this.date_labels.visible = true;
            desc_pos = 1;
        }

        //
        // Also, parse the due:date tag if found.
        //
        for (let i = desc_pos; i < len; i++) {
            if (REG_CONTEXT.test(words[i])) {
                this.contexts.push(words[i]);
                words[i] = '<span foreground="' +
                           this.delegate.markup_colors.context +
                           '"><b>' + words[i] + '</b></span>';
            }
            else if (REG_PROJ.test(words[i])) {
                this.projects.push(words[i]);
                words[i] = '<span foreground="' +
                           this.delegate.markup_colors.project +
                           '"><b>' + words[i] + '</b></span>';
            }
            else if (REG_URL.test(words[i])) {
                words[i] = '<span foreground="' +
                           this.delegate.markup_colors.link +
                           '"><u>' + words[i] + '</u></span>';
            }
            else if (REG_TAG.test(words[i])) {

                if (REG_DUE_TAG.test(words[i]) && !this.hidden) {
                    this.due_date = words[i].slice(4);
                    this.due_date_label.text += I18N._('due:') + words[i].slice(4);
                    this.due_date_label.visible = true;
                    this.update_due_date();

                    words.splice(i, 1);
                    i--;
                }
                else if (words[i] === 'h:1') {
                    this.hidden = true;
                    this.actor.add_style_class_name('hidden');
                    this.completion_checkbox.checked = false;
                    this.completion_checkbox.hide();
                    this.priority = '(~)';
                    this.prio_label.hide();
                    this.due_date_label.hide();
                    this.date_labels.hide();
                    if (this.edit_icon_bin) this.edit_icon_bin.visible = false;

                    let icon_incognito_bin = new St.Button({ can_focus: true });
                    this.header.insert_child_at_index(icon_incognito_bin, 0);

                    let icon_incognito = new St.Icon();
                    icon_incognito_bin.add_actor(icon_incognito);

                    ICON_FROM_URI.icon_from_uri(icon_incognito,
                                                CustomIcon.HIDDEN,
                                                this.applet.metadata);

                    words.splice(i, 1);
                    i--;
                }
                else if (REG_PRIO_TAG.test(words[i])) {
                    words.splice(i, 1);
                    i--;
                }
            }
        }

        let markup = words.slice(desc_pos, len).join(' ');

        // Escape '&' and '<', or else pango will throw an error.
        // It could still throw an error if a tag is properly structured, but is
        // not supported by pango.
        markup = markup.replace(/&(?!amp;|quot;|apos;|lt;|gt;)/g, '&amp;');
        markup = markup.replace(/<(?!\/?.*>)/g, '&lt;');

        this.msg.clutter_text.set_markup(markup);
    },

    // Return word under mouse cursor if it's a context or project, else null.
    _find_keyword: function (event) {
        let len = this.msg.clutter_text.text.length;

        // get screen coord of mouse
        let [x, y] = event.get_coords();

        // make coords relative to the msg actor
        [, x, y] = this.msg.transform_stage_point(x, y);

        // find pos of char that was clicked
        let pos = this.msg.clutter_text.coords_to_position(x, y);


        //
        // get word that contains the clicked char
        //
        if (! this.msg.clutter_text.text[pos] ||
            this.msg.clutter_text.text[pos] === ' ') return null;

        let begin = pos;
        while (this.msg.clutter_text.text[begin] !== ' ' && begin > 0) begin--;

        let end = pos;
        while (this.msg.clutter_text.text[end] !== ' ' && end !== len + 1) end++;

        let word = this.msg.clutter_text.text.substring(begin, end).trim();


        if (REG_CONTEXT.test(word) || REG_PROJ.test(word) || REG_URL.test(word))
            return word;
        else
            return null;
    },

    // @BUG
    // There is an issue with resizing when using pango's wrap mode.
    // It seems that the clutter text height will sometimes* be computed to be
    // bigger than it's actual height by 1 line. This leads to an ugly padding
    // at the bottom of the applet, which gets bigger as more items are
    // incorrectly computed.
    //
    // * By sometimes, it seems only when the text is one char away from being
    // wrapped.
    //
    // The issue does not occur if the scrollbar is visible, so we only resize
    // items while the scrollbar isn't shown and after that nop out for
    // performance reasons.
    _resize_msg: function () {
        if (this.delegate.tasks_scroll.vscrollbar_visible ||
            ! this.delegate.tasks_scroll.visible) {

            return;
        }

        let theme_node = this.msg.get_theme_node();
        let alloc_box  = this.msg.get_allocation_box();
        let width      = theme_node.adjust_for_width(alloc_box.x2 - alloc_box.x1);

        let [min_height, nat_height] =
            this.msg.clutter_text.get_preferred_height(width);

        if (this.msg_vert_padding < 0) {
            let [min_height_adjusted, nat_height_adjusted] =
                theme_node.adjust_preferred_height(min_height, nat_height);

            this.msg_vert_padding = nat_height_adjusted - nat_height;
        }

        this.msg.set_height(nat_height + this.msg_vert_padding);
    },

    _on_event: function (actor, event) {
        switch (event.type()) {
            case Clutter.EventType.ENTER: {
                this._show_header_icons();
                break;
            }

            case Clutter.EventType.LEAVE: {
                if (! this.header.contains(global.stage.get_key_focus()))
                    this._hide_header_icons();
                break;
            }

            case Clutter.EventType.KEY_RELEASE: {
                this._show_header_icons();
                SCROLL_TO_ITEM.scroll(this.delegate.tasks_scroll,
                                      this.delegate.tasks_scroll_content,
                                      actor);
                break;
            }

            case Clutter.EventType.KEY_PRESS: {
                Mainloop.idle_add(() => {
                    if (! this.header.contains(global.stage.get_key_focus()))
                        this._hide_header_icons();
                });
                break;
            }

            case Clutter.EventType.BUTTON_RELEASE: {
                if (this.prio_label.has_pointer) {
                    this.delegate.add_task_button.grab_key_focus();
                    this.delegate.activate_filter(this.priority);
                }
                else if (this.msg.has_pointer) {
                    if (! this.current_keyword) break;

                    this.delegate.add_task_button.grab_key_focus();

                    if (REG_URL.test(this.current_keyword)) {
                        if (this.current_keyword.indexOf(':') === -1)
                            this.current_keyword = 'https://' + this.current_keyword;

                        try {
                            Gio.app_info_launch_default_for_uri(this.current_keyword,
                                global.create_app_launch_context(0, -1));
                        }
                        catch (e) { global.logError(e.message); }
                    }
                    else this.delegate.activate_filter(this.current_keyword);
                }

                break;
            }
        }
    },

    _on_checkbox_clicked: function () {
        let old_prio = this.priority;

        if (this.completion_checkbox.checked) {
            if (this.priority !== '(_)' && this.priority !== '(x)') {
                this.task_str = 'x ' +
                                date_yyyymmdd() +
                                this.task_str.slice(3) +
                                ' pri:' + this.priority[1];
            }
            else this.task_str = 'x ' + date_yyyymmdd() + ' ' + this.task_str;

            this.priority = '(x)';
            this.update_task();
        }
        else {
            let prio  = '';
            let words = this.task_str.split(/ +/);

            let i = words.length;
            while (i--) {
                if (REG_PRIO_TAG.test(words[i])) {
                    prio = '(' + words[i][4] + ') ';
                    words.splice(i, 1);
                    break;
                }
            }

            if (REG_DATE.test(words[1])) words.splice(0, 2);
            else                         words.splice(0, 1);

            this.update_task(prio + words.join(' '));
        }

        this.delegate.on_task_checkbox_clicked(old_prio, this);
    },

    on_tracker_started: function () {
        this._show_tracker_running_icon();
    },

    on_tracker_stopped: function () {
        this._show_tracker_stopped_icon();
    },

    update_due_date: function () {
        if (this.due_date === '9999-99-99') return;

        let due  = Date.parse(this.due_date + 'T00:00:00');
        let diff = Math.ceil((due - Date.now()) / 86400000);
        let abs  = Math.abs(diff);

        if (diff === 0)
            abs = I18N._('today');
        else if (diff < 0)
            abs = I18N.ngettext('%d day ago', '%d days ago', abs).format(abs);
        else
            abs = I18N.ngettext('in %d day', 'in %d days', abs).format(abs);

        this.due_date_label.text = I18N._('due:') + this.due_date + ' (' + abs + ')';
    },

    update_task: function (task_str) {
        if (task_str) this.task_str = task_str;

        // reset
        this.priority               = '(_)';
        this.projects               = [];
        this.contexts               = [];
        this.creation_date          = '9999-99-99';
        this.completion_date        = '9999-99-99';
        this.due_date               = '9999-99-99';
        this.prio_label.visible     = false;
        this.prio_label.text        = '';
        this.due_date_label.visible = false;
        this.due_date_label.text    = '';
        this.date_labels.visible    = false;
        this.date_labels.text       = '';
        this.actor.style_class      = 'task-item';
        this.completion_checkbox.checked = false;
        this.completion_checkbox.visible = true;
        if (this.hidden) {
            this.hidden = false;
            this.header.remove_child(this.header.get_child_at_index(0));
        }

        this._parse_task_str();
    },
};
Signals.addSignalMethods(TaskItem.prototype);



// =====================================================================
// @@@ The window used for adding/editing filters.
//
// @applet:   obj (The actual applet objects.)
// @delegate: obj (The main object of this section.)
//
// @signals:
//  - 'update-filters', (returns obj) -> { invert_filters    : bool,
//                                         custom_filters    : arr,
//                                         active_filters    : obj, }
// =====================================================================
function TaskFiltersWindow(applet, delegate) {
    this._init(applet, delegate);
}

TaskFiltersWindow.prototype = {
    _init: function(applet, delegate) {
        try {
        this.applet         = applet;
        this.delegate       = delegate;
        this.active_filters = delegate.cache.filters.active_filters;


        // Keywords contains the contexts, projects, and custom filters.
        this.filter_register = {
            priorities : [],
            contexts   : [],
            projects   : [],
            custom     : [],
        };

        this.text_map = {
            '(_)' : I18N._('No Priority'),
            '(x)' : I18N._('Completed'),
        };

        //
        // draw
        //
        this.actor = new St.Bin({ x_fill: true, style_class: 'view-box filter-window popup-menu-item' });

        this.content_box = new St.BoxLayout({ x_expand: true, vertical: true, style_class: 'view-box-content menu-favorites-box' });
        this.actor.add_actor(this.content_box);


        //
        // filter sectors
        //
        this.filter_sectors_scroll = new St.ScrollView();
        this.content_box.add_actor(this.filter_sectors_scroll);
        // allow scrolling by grabbing with the mouse
        this.filter_sectors_scroll.vscroll.connect('scroll-start', () => { applet.menu.passEvents = true; });
        this.filter_sectors_scroll.vscroll.connect('scroll-stop', () => { applet.menu.passEvents = false; });

        this.filter_sectors_scroll_box = new St.BoxLayout({ vertical: true });
        this.filter_sectors_scroll.add_actor(this.filter_sectors_scroll_box);


        //
        // custom filters sector
        //
        this.custom_filters = new St.BoxLayout({ vertical: true, x_expand: true, style_class: 'filter-settings-sector popup-menu-item' });
        this.filter_sectors_scroll_box.add_actor(this.custom_filters);

        this.entry = new MULTIL_ENTRY.MultiLineEntry(I18N._('Add custom filter...'), false, true);
        this.custom_filters.add_child(this.entry.actor);


        //
        // priorities sector
        //
        this.priorities = new St.BoxLayout({ vertical: true, x_expand: true, style_class: 'filter-settings-sector popup-menu-item' });
        this.filter_sectors_scroll_box.add_actor(this.priorities);


        //
        // contexts sector
        //
        this.contexts = new St.BoxLayout({ vertical: true, x_expand: true, style_class: 'filter-settings-sector popup-menu-item' });
        this.filter_sectors_scroll_box.add_actor(this.contexts);


        //
        // projects sector
        //
        this.projects = new St.BoxLayout({ vertical: true, x_expand: true, style_class: 'filter-settings-sector popup-menu-item' });
        this.filter_sectors_scroll_box.add_actor(this.projects);


        this._add_separator(this.content_box);


        //
        // show hidden tasks switch
        //
        this.show_hidden_tasks_item = new St.BoxLayout({ style_class: 'popup-menu-item' });
        this.content_box.add_child(this.show_hidden_tasks_item);

        let show_hidden_tasks_label = new St.Label({ text: I18N._('Show only hidden tasks'), y_align: St.Align.END });
        this.show_hidden_tasks_item.add(show_hidden_tasks_label, {expand: true});

        let hidden_count_label = new St.Label({ y_align: Clutter.ActorAlign.CENTER, style_class: 'popup-inactive-menu-item' });
        this.show_hidden_tasks_item.add_child(hidden_count_label);

        let n = this.delegate.priorities.get('(~)') || 0;
        hidden_count_label.text =
            I18N.ngettext('%d hidden task', '%d hidden tasks', n).format(n);

        this.show_hidden_tasks_toggle = new PopupMenu.Switch();
        this.show_hidden_tasks_item.add_actor(this.show_hidden_tasks_toggle.actor);
        this.show_hidden_tasks_toggle.actor.can_focus = true;
        this.show_hidden_tasks_toggle.actor.reactive  = true;


        //
        // Invert switch (whitelist/blacklist)
        //
        this.invert_switch_item = new St.BoxLayout({ style_class: 'popup-menu-item' });
        this.content_box.add_child(this.invert_switch_item);

        let invert_label = new St.Label({ text: I18N._('Invert filters'), y_align: St.Align.END });
        this.invert_switch_item.add(invert_label, {expand: true});

        this.invert_toggle = new PopupMenu.Switch();
        this.invert_switch_item.add_actor(this.invert_toggle.actor);

        this.invert_toggle.actor.can_focus = true;
        this.invert_toggle.actor.reactive  = true;


        //
        // buttons
        //
        this.btn_box = new St.BoxLayout({ x_expand: true, style_class: 'popup-menu-item btn-box' });
        this.content_box.add_child(this.btn_box);

        this.button_reset = new St.Button({ can_focus: true, label: I18N._('Reset'), style_class: 'button notification-icon-button modal-dialog-button' });
        this.button_ok    = new St.Button({ can_focus: true, label: I18N._('Ok'), style_class: 'btn-ok button notification-icon-button modal-dialog-button' });

        this.btn_box.add(this.button_reset, {expand: true});
        this.btn_box.add(this.button_ok, {expand: true});


        //
        // load filter items
        //
        this._load_filters();


        //
        // listen
        //
        this.entry.entry.clutter_text.connect('key-focus-in', () => {
            SCROLL_TO_ITEM.scroll(this.filter_sectors_scroll,
                                  this.filter_sectors_scroll_box,
                                  this.custom_filters);
        });
        this.entry.entry.clutter_text.connect('activate', () => {
            if (! this.entry.entry.text) return;

            // check for duplicates
            let i = this.filter_register.custom.length;
            while (i--)
                if (this.filter_register.custom[i].label.text === this.entry.entry.text)
                    return;

            let item = this._new_filter_item(true, this.entry.entry.text, null, true);
            this.custom_filters.add_child(item.actor);
            this.filter_register.custom.push(item);
            this.entry.entry.text = '';
        });
        this.show_hidden_tasks_toggle.actor.connect('button-release-event', () => {
            this.show_hidden_tasks_toggle.toggle();
        });
        this.invert_toggle.actor.connect('button-release-event', () => {
            this.invert_toggle.toggle();
        });
        this.show_hidden_tasks_toggle.actor.connect('key-press-event', (_, event) => {
            if (event.get_key_symbol() === Clutter.Return)
                this.show_hidden_tasks_toggle.toggle();
        });
        this.invert_toggle.actor.connect('key-press-event', (_, event) => {
            if (event.get_key_symbol() === Clutter.Return)
                this.invert_toggle.toggle();
        });
        this.button_reset.connect('clicked', () => {
            this._reset_all();
        });
        this.button_ok.connect('clicked', () => {
            this._on_ok_clicked();
        });
        }catch(e){global.logError(e);}
    },

    _load_filters: function () {
        this.invert_toggle.setToggleState(
            this.delegate.cache.filters.invert_filters);

        this.show_hidden_tasks_toggle.setToggleState(
            this.delegate.cache.filters.show_hidden);


        let i, key, value, item, check;

        // custom filters
        i = this.delegate.cache.filters.custom_filters.length;
        while (i--) {
            value = this.delegate.cache.filters.custom_filters[i];
            check = this.active_filters.custom.indexOf(value) === -1 ? false : true;
            item  = this._new_filter_item(check, value, null, true);
            this.custom_filters.add_child(item.actor);
            this.filter_register.custom.push(item);
        }

        //
        // priorities
        //
        this._add_separator(this.priorities);

        for ([key, value] of this.delegate.priorities.entries()) {
            if (key === '(~)') continue; // skip hidden tasks here
            check = this.active_filters.priorities.indexOf(key) === -1 ? false : true;
            item = this._new_filter_item(check, key, value);
            this.filter_register.priorities.push(item);
        }

        this.filter_register.priorities.sort((a, b) => {
            return +(a.prio_label.text > b.prio_label.text) ||
                   +(a.prio_label.text === b.prio_label.text) - 1;
        });

        for (i = 0; i < this.filter_register.priorities.length; i++)
            this.priorities.add_child(this.filter_register.priorities[i].actor);

        //
        // contexts
        //
        this._add_separator(this.contexts);

        for ([key, value] of this.delegate.contexts.entries()) {
            check = this.active_filters.contexts.indexOf(key) === -1 ? false : true;
            item  = this._new_filter_item(check, key, value);
            this.contexts.add_child(item.actor);
            this.filter_register.contexts.push(item);
        }

        //
        // projects
        //
        this._add_separator(this.projects);

        for ([key, value] of this.delegate.projects.entries()) {
            check = this.active_filters.projects.indexOf(key) === -1 ? false : true;
            item  = this._new_filter_item(check, key, value);
            this.projects.add_child(item.actor);
            this.filter_register.projects.push(item);
        }

        // hide the sections that don't have any items
        let arr = [this.priorities, this.contexts, this.projects];
        arr.forEach((it) => it.get_n_children() === 1 && it.hide());
    },

    _reset_all: function () {
        for (var k in this.filter_register) {
            if (this.filter_register.hasOwnProperty(k)) {
                let i = this.filter_register[k].length;
                while (i--) this.filter_register[k][i].checkbox.setToggleState(false);
            }
        }
    },

    _new_filter_item: function (is_checked, prio_label, count, is_deletable) {
        let item = {};


        item.actor = new St.BoxLayout({ reactive: true });


        item.prio = prio_label; // in case we need to map, we keep the old value


        item.prio_label = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
        item.actor.add(item.prio_label, {expand: true});
        if (prio_label === '(_)' || prio_label === '(x)')
            item.prio_label.text = this.text_map[prio_label];
        else
            item.prio_label.text = prio_label;


        item.count_label = new St.Label({ y_align: Clutter.ActorAlign.CENTER, style_class: 'popup-inactive-menu-item' });
        item.actor.add_child(item.count_label);
        item.count_label.text =
            I18N.ngettext('%d task', '%d tasks', count).format(count) + '   ';


        item.option_box = new St.BoxLayout({ style_class: 'option-box' });
        item.actor.add_child(item.option_box);


        item.checkbox = new CheckBox.CheckButton(is_checked);
        item.option_box.add_actor(item.checkbox.actor);


        let close_button;

        if (is_deletable) {
            close_button = new St.Button({ can_focus: true, style_class: 'close-icon' });
            item.option_box.add_actor(close_button);

            let close_icon = new St.Icon({ icon_name: 'window-close' });
            close_button.add_actor(close_icon);

            close_button.connect('clicked', () => {
                if (item.checkbox.actor.has_key_focus || close_button.has_key_focus)
                    this.entry.entry.grab_key_focus();
                item.actor.destroy();
                this._clean_filter_register();
            });
        }

        let actor_to_connect = is_deletable ? close_button : item.checkbox.actor;

        actor_to_connect.connect('key-focus-in', () => {
            SCROLL_TO_ITEM.scroll(this.filter_sectors_scroll,
                                  this.filter_sectors_scroll_box,
                                  sector);
        });

        return item;
    },

    // Remove objects from the filter_register whose actors have been destroyed.
    // We can detect which one it is by checking whether the label.text is null.
    _clean_filter_register: function () {
        let i, k;

        for (k in this.filter_register) {
            if (this.filter_register.hasOwnProperty(k)) {
                i = this.filter_register[k].length;
                while (i--)
                    if (this.filter_register[k][i].label.text === null)
                        this.filter_register[k].splice(i, 1);
            }
        }
    },

    _add_separator: function (container) {
        let sep = new PopupMenu.PopupSeparatorMenuItem();
        sep.actor.add_style_class_name('timepp-separator');
        container.add_child(sep.actor);
    },

    _on_ok_clicked: function () {
        let res = {
            show_hidden:    this.show_hidden_tasks_toggle.state,
            invert_filters: this.invert_toggle.state,
            custom_filters: [],
            active_filters: {
                priorities : [],
                contexts   : [],
                projects   : [],
                custom     : [],
            },
        };

        let i, k;

        for (k in this.filter_register) {
            if (this.filter_register.hasOwnProperty(k)) {
                i = this.filter_register[k].length;

                while (i--) {
                    if (this.filter_register[k][i].checkbox.actor.checked) {
                        res.active_filters[k].push(
                            this.filter_register[k][i].prio);
                    }
                }
            }
        }

        i = this.filter_register.custom.length;
        while (i--) {
            res.custom_filters.push(
                this.filter_register.custom[i].prio);
        }

        this.emit('update-filters', res);
    },
};
Signals.addSignalMethods(TaskFiltersWindow.prototype);



// =====================================================================
// @@@ The window used for editing the sort mode.
//
// @applet:   obj (The actual applet objects.)
// @delegate: obj (The main object of this section.)
//
// @signals: 'update-sort'
// =====================================================================
function TaskSortWindow(applet, delegate) {
    this._init(applet, delegate);
}

TaskSortWindow.prototype = {
    _init: function(applet, delegate) {
        this.applet   = applet;
        this.delegate = delegate;

        this.text_map = {};
        this.text_map[SortType.PRIORITY]        = I18N._('Sort by Priority');
        this.text_map[SortType.CREATION_DATE]   = I18N._('Sort by Creation Date');
        this.text_map[SortType.COMPLETION_DATE] = I18N._('Sort by Completion Date');
        this.text_map[SortType.DUE_DATE]        = I18N._('Sort by Due Date');

        this.current_sort_order = '';
        this.checked_sort_item  = null;

        // Array of the all sort_type items.
        this.sort_types = [];


        //
        // draw
        //
        this.actor = new St.Bin({ x_fill: true, style_class: 'view-box sort-window popup-menu-item' });

        this.content_box = new St.BoxLayout({ x_expand: true, vertical: true, style_class: 'view-box-content menu-favorites-box' });
        this.actor.add_actor(this.content_box);


        let radio_checkmark;


        //
        // sort mode (ascending/descending)
        //
        this.ascending_item = new St.BoxLayout({ reactive: true, style_class: 'popup-menu-item' });
        this.content_box.add_child(this.ascending_item);

        this.ascending_label = new St.Label ({ text: I18N._('Ascending'), y_align: Clutter.ActorAlign.CENTER });
        this.ascending_item.add(this.ascending_label, {expand: true});

        this.ascending_radiobutton = new St.Button({ style_class: 'radiobutton', toggle_mode: true, can_focus: true, y_align: St.Align.MIDDLE });
        this.ascending_item.add_child(this.ascending_radiobutton);

        radio_checkmark = new St.Bin();
        this.ascending_radiobutton.add_actor(radio_checkmark);


        this.descending_item = new St.BoxLayout({ reactive: true, style_class: 'popup-menu-item' });
        this.content_box.add_child(this.descending_item);

        this.descending_label = new St.Label ({ text: I18N._('Descending'), y_align: Clutter.ActorAlign.CENTER });
        this.descending_item.add(this.descending_label, {expand: true});

        this.descending_radiobutton = new St.Button({ style_class: 'radiobutton', toggle_mode: true, can_focus: true, y_align: St.Align.MIDDLE });
        this.descending_item.add_child(this.descending_radiobutton);

        radio_checkmark = new St.Bin();
        this.descending_radiobutton.add_actor(radio_checkmark);


        //
        // separator
        //
        let sep = new PopupMenu.PopupSeparatorMenuItem();
        sep.actor.add_style_class_name('timepp-separator');
        this.content_box.add_child(sep.actor);


        //
        // sort types
        //
        this._new_sort_type_item(SortType.PRIORITY);
        this._new_sort_type_item(SortType.CREATION_DATE);
        this._new_sort_type_item(SortType.COMPLETION_DATE);
        this._new_sort_type_item(SortType.DUE_DATE);


        //
        // buttons
        //
        this.btn_box = new St.BoxLayout({ x_expand: true, style_class: 'popup-menu-item btn-box' });
        this.content_box.add_child(this.btn_box);
        this.button_ok    = new St.Button({ can_focus: true, label: I18N._('Ok'), style_class: 'btn-ok button notification-icon-button modal-dialog-button' });
        this.btn_box.add(this.button_ok, {expand: true});


        //
        // listen
        //
        this.ascending_radiobutton.connect('clicked', () => {
            this.current_sort_order = SortOrder.ASCENDING;
            this.ascending_radiobutton.checked = true;
            this.descending_radiobutton.checked = false;
        });
        this.descending_radiobutton.connect('clicked', () => {
            this.current_sort_order = SortOrder.DESCENDING;
            this.ascending_radiobutton.checked = false;
            this.descending_radiobutton.checked = true;
        });
        this.button_ok.connect('clicked', () => {
            this.emit('update-sort', { sort_order : this.current_sort_order,
                                       sort_type  : this.checked_sort_item.sort_type });
        });


        //
        // check buttons
        //
        if (this.delegate.cache.sort.sort_order === SortOrder.ASCENDING) {
            this.current_sort_order = SortOrder.ASCENDING;
            this.ascending_radiobutton.checked = true;
        }
        else {
            this.current_sort_order = SortOrder.DESCENDING;
            this.descending_radiobutton.checked = true;
        }


        let it;
        let i = this.sort_types.length;
        while (i--) {
            it = this.sort_types[i];

            if (it.sort_type === this.delegate.cache.sort.sort_type) {
                it.radiobutton.checked = true;
                this.checked_sort_item = it;
            }
        }
    },

    _new_sort_type_item: function (sort_type) {
        let item = {};
        this.sort_types.push(item);

        item.sort_type = sort_type;

        item.actor = new St.BoxLayout({ reactive: true, style_class: 'popup-menu-item' });
        this.content_box.add_child(item.actor);

        item.label = new St.Label ({ text: this.text_map[sort_type], y_align: Clutter.ActorAlign.CENTER });
        item.actor.add(item.label, {expand: true});

        item.radiobutton = new St.Button({ style_class: 'radiobutton', toggle_mode: true, can_focus: true, y_align: St.Align.MIDDLE });
        item.actor.add_child(item.radiobutton);

        let radio_checkmark = new St.Bin();
        item.radiobutton.add_actor(radio_checkmark);

        item.radiobutton.connect('clicked', () => {
            this.checked_sort_item.radiobutton.checked = false;
            item.radiobutton.checked = true;
            this.checked_sort_item   = item;
        });
    },
};
Signals.addSignalMethods(TaskSortWindow.prototype);



// =====================================================================
// @@@ Clear window.
//
// @applet:   obj (The actual applet objects.)
// @delegate: obj (The main object of this section.)
//
// @signals:
//   - 'delete-all'  (delete all completed tasks)
//   - 'archive-all' (delete and write to done.txt all completed tasks)
//   - 'cancel'
// =====================================================================
function ClearCompletedTasks(applet, delegate) {
    this._init(applet, delegate);
}

ClearCompletedTasks.prototype = {
    _init: function(applet, delegate) {
        this.applet   = applet;
        this.delegate = delegate;


        //
        // draw
        //
        this.actor = new St.Bin({ x_fill: true, style_class: 'view-box clear-window popup-menu-item' });

        this.content_box = new St.BoxLayout({ x_expand: true, vertical: true, style_class: 'view-box-content menu-favorites-box' });
        this.actor.add_actor(this.content_box);


        //
        // options
        //
        this.delete_all_item = new St.BoxLayout({ reactive: true, style_class: 'popup-menu-item' });
        this.content_box.add_child(this.delete_all_item);

        this.delete_all_label = new St.Label ({ text: I18N._('Delete all completed tasks'), y_align: Clutter.ActorAlign.CENTER, style_class: 'delete-complete-tasks-label' });
        this.delete_all_item.add(this.delete_all_label, {expand: true});

        this.delete_all_radiobutton = new St.Button({ style_class: 'radiobutton', toggle_mode: true, can_focus: true, y_align: St.Align.MIDDLE });
        this.delete_all_item.add_child(this.delete_all_radiobutton);

        let delete_all_checkmark = new St.Bin();
        this.delete_all_radiobutton.add_actor(delete_all_checkmark);


        this.archive_all_item = new St.BoxLayout({ reactive: true, style_class: 'popup-menu-item' });
        this.content_box.add_child(this.archive_all_item);

        this.archive_all_label = new St.Label ({ text: I18N._('Archive all complete tasks to done.txt and delete them'), y_align: Clutter.ActorAlign.CENTER, style_class: 'archive-all-complete-tasks-label' });
        this.archive_all_item.add(this.archive_all_label, {expand: true});

        this.archive_all_radiobutton = new St.Button({ style_class: 'radiobutton', checked: true, toggle_mode: true, can_focus: true, y_align: St.Align.MIDDLE });
        this.archive_all_item.add_child(this.archive_all_radiobutton);

        let archive_all_checkmark = new St.Bin();
        this.archive_all_radiobutton.add_actor(archive_all_checkmark);

        if (! this.delegate.done_txt_file_path) {
            this.archive_all_item.hide();
        }


        //
        // buttons
        //
        this.btn_box = new St.BoxLayout({ x_expand: true, style_class: 'popup-menu-item btn-box' });
        this.content_box.add_child(this.btn_box);

        this.button_cancel = new St.Button({ can_focus: true, label: I18N._('Cancel'), style_class: 'btn-cancel button notification-icon-button modal-dialog-button' });
        this.btn_box.add(this.button_cancel, {expand: true});

        this.button_ok = new St.Button({ can_focus: true, label: I18N._('Ok'), style_class: 'btn-ok button notification-icon-button modal-dialog-button' });
        this.btn_box.add(this.button_ok, {expand: true});


        //
        // listen
        //
        this.archive_all_radiobutton.connect('clicked', () => {
            this.delete_all_radiobutton.checked = false;
        });
        this.delete_all_radiobutton.connect('clicked', () => {
            this.archive_all_radiobutton.checked = false;
        });
        this.button_ok.connect('clicked',  () => {
            if (this.delete_all_radiobutton.checked)
                this.emit('delete-all');
            else
                this.emit('archive-all');
        });
        this.button_cancel.connect('clicked', () => { this.emit('cancel'); });
    },
};
Signals.addSignalMethods(ClearCompletedTasks.prototype);



// =====================================================================
// @@@ UI for showing time tracker stats
//
// @applet:   obj (The actual applet objects.)
// @delegate: obj (The main object of this section.)
// @stats: null or array (of stats object produced by TimeTracker.get_stats)
//
// @stats === null means that the records for a task/project weren't found.
// =====================================================================
function TimeTrackerStatView(applet, delegate, stats) {
    this._init(applet, delegate, stats);
}

TimeTrackerStatView.prototype = {
    _init: function(applet, delegate, stats) {
        this.actor = new St.Bin({ x_fill: true, style_class: 'view-box stats-window popup-menu-item' });

        this.content_box = new St.BoxLayout({ x_expand: true, vertical: true, style_class: 'view-box-content menu-favorites-box' });
        this.actor.add_actor(this.content_box);

        this.close_button = new St.Button({ can_focus: true, style_class: 'close-icon', x_expand: true, x_align: St.Align.END });
        this.content_box.add_actor(this.close_button);

        let close_icon = new St.Icon({ icon_name: 'window-close' });
        this.close_button.add_actor(close_icon);

        this.close_button.connect('clicked', () => { this.emit('close'); });

        let scroll_view = new St.ScrollView();
        this.content_box.add_actor(scroll_view);

        // enable scrolling by grabbing with the mouse
        scroll_view.vscroll.connect('scroll-start', () => { applet.menu.passEvents = true; });
        scroll_view.vscroll.connect('scroll-stop', () => { applet.menu.passEvents = false; });

        let scroll_content = new St.BoxLayout({ vertical: true });
        scroll_view.add_actor(scroll_content);

        if (! stats) {
            let label = new St.Label({ text : I18N._('Nothing found...'), style: 'font-weight: bold;', style_class: 'popup-menu-item' });
            scroll_content.add_child(label);

            return;
        }


        let markup = '';

        for (let i = 0, len = stats.length; i < len; i++) {
            it = stats[i];

            markup +=
                '<b>' + it.name + '</b>:' +
                '\n\n    ' +
                '<b>'+I18N._('today')+'</b>        :  ' + this._format(it.today) +
                '\n    ' +
                '<b>'+I18N._('last 3 days')+'</b>  :  ' + this._format(it.last_three_days) +
                '\n    ' +
                '<b>'+I18N._('this week')+'</b>    :  ' + this._format(it.this_week) +
                '\n    ' +
                '<b>'+I18N._('this month')+'</b>   :  ' + this._format(it.this_month) +
                '\n    ' +
                '<b>'+I18N._('this year')+'</b>    :  ' + this._format(it.this_year);

            if (i !== len - 1 && len > 1) markup += '\n\n\n\n';
        }

        let text = new St.Label({ text: it.name, style_class: 'stats-item-title popup-menu-item' });
        scroll_content.add_actor(text);

        text.clutter_text.line_wrap      = true;
        text.clutter_text.ellipsize      = Pango.EllipsizeMode.NONE;
        text.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;

        text.clutter_text.set_markup('<tt>' + markup + '</tt>');
    },

    _format: function (seconds) {
        return '' + Math.floor(seconds / 3600)      + 'h ' +
                    Math.round(seconds % 3600 / 60) + 'm';
    },
};
Signals.addSignalMethods(TimeTrackerStatView.prototype);



// =====================================================================
// @@@ Time tracker
//
// @applet:   obj (The actual applet objects.)
// @delegate: obj (The main object of this section.)
// =====================================================================
function TimeTracker(applet, delegate) {
    this._init(applet, delegate);
}

TimeTracker.prototype = {
    _init: function(applet, delegate) {
        this.applet   = applet;
        this.delegate = delegate;


        delegate.settings.bindWithObject(this, 'time_tracker_csv_dir', 'csv_dir',
            () => { this._init_tracker_dir(); });


        this.timer_seconds_proc_id   = null;
        this.timer_minutes_proc_id   = null;
        this.number_of_tracked_tasks = 0;
        this.daily_csv_file_monitor_handler_block = false;


        // We only read the yearly csv file for statistics lookup.
        // The daily csv file is appended to it each day.
        //
        // The structure of the yearly map is:
        //
        // @key : string
        // @val : array
        //
        // @key:
        //   is a string which is either a task string (a single line in the
        //   todo.txt file) or a project keyword (e.g., '+my_project', '+stuff',
        //   etc...)
        //
        // @val:
        //   is an object of the form: { type    : string,
        //                               records : array, }
        //
        //   @type
        //     is either the string '++' or the string '()'.
        //     '++' means it's a project, '()' means it's a task.
        //
        //   @records
        //     is an array of objects where each object is of the form:
        //     {date: string (in yyyy-mm-dd format), time: int (seconds)}
        //     E.g., {date: '3434-34-34', time: 324}
        this.yearly_csv_map = new Map();


        // The structure of the daily map is:
        //
        // @key:
        //   is a string which is either a task string (a single line in the
        //   todo.txt file) or a project keyword (e.g., '+my_project', '+stuff',
        //   etc...)
        //
        // @val:
        //   is an object of the form: { time     : int,
        //                               tracking : bool,
        //                               type     : string, }
        //
        //   If the type is '++' (a project), then the @val obj will have the
        //   additional property: tracked_children (int).
        //
        //   If the type is '()' (a task), then the @val object will have the
        //   additional property: task_ref (obj).
        //
        //   @time     : time tracked in seconds.
        //   @tracking : indicates whether the entry is being tracked.
        //   @type     : indicates whether the entry is a project or task.
        //
        //   @task_ref : the ref of the corresponding task object.
        //   @tracked_children:
        //     number of tasks that are part of this project and that are being
        //     tracked.
        this.daily_csv_map = new Map();


        //
        // init csv dir
        // we init the daily/yearly csv maps with the this func as well
        this._init_tracker_dir();


        //
        // listen
        //
        this.delegate.connect('new-day', () => {
            this._archive_daily_csv_file();
        });
        this.applet.connect('stop-time-tracking', () => {
            this.stop_all_tracking();
        });
    },

    _start_timers: function () {
        if (! this.timer_seconds_proc_id) this._timer_seconds();
        if (! this.timer_minutes_proc_id) this._timer_minutes();
    },

    _timer_seconds: function () {
        if (this.number_of_tracked_tasks === 0) {
            this.timer_seconds_proc_id = null;
            return;
        }

        for (let [, v] of this.daily_csv_map.entries()) {
            if (v.tracking) v.time++;
        }

        this.timer_seconds_proc_id = Mainloop.timeout_add_seconds(1, () => {
            this._timer_seconds();
        });
    },

    _timer_minutes: function () {
        if (this.number_of_tracked_tasks === 0) {
            this.timer_minutes_proc_id = null;
            return;
        }

        this.timer_minutes_proc_id = Mainloop.timeout_add_seconds(60, () => {
            this._write_daily_csv_file();
            this._timer_minutes();
        });
    },

    _init_yearly_csv_map: function () {
        if (this.csv_dir === '') return;

        let [, contents] = this.yearly_csv_file.load_contents(null);
        contents = String(contents).trim().split(/\n|\r/);

        let it, val, record, key;

        for (let i = 0, len = contents.length; i < len; i++) {
            it = contents[i].trim();

            if (it === '') continue;

            key    = it.substring(24, it.length - 1);
            val    = this.yearly_csv_map.get(key);
            record = {
                date : it.substr(0, 10),
                time : +(it.substr(12, 2)) * 3600 + (+(it.substr(15, 2)) * 60),
            };

            if (val)
                val.records.push(record);
            else
                this.yearly_csv_map.set(key, {
                    type    : it.substr(19, 2),
                    records : [record],
                });
        }
    },

    _init_daily_csv_map: function () {
        if (this.csv_dir === '') return;

        let [, contents] = this.daily_csv_file.load_contents(null);
        contents = String(contents).trim().split(/\n|\r/);

        for (let i = 0, len = contents.length; i < len; i++) {
            if (contents[i] === '') continue;

            if (contents[i].substr(0, 10) !== date_yyyymmdd()) {
                this._archive_daily_csv_file();
                return;
            }
        }

        let it, key, type;

        for (let i = 0, len = contents.length; i < len; i++) {
            it = contents[i].trim();

            if (it === '') continue;

            key  = it.substring(24, it.length - 1);
            type = it.substr(19, 2);

            this.daily_csv_map.set(key, {
                time : +(it.substr(12, 2)) * 3600 + (+(it.substr(15, 2)) * 60),
                tracking : false,
                type     : type,
            });

            if (type === '++') this.daily_csv_map.get(key).tracked_children = 0;
            else               this.daily_csv_map.get(key).task_ref = null;
        }
    },

    _init_tracker_dir: function () {
        if (this.csv_dir === '') return;

        //
        // reset
        //
        if (this.yearly_csv_file_monitor_id) {
            this.yearly_csv_file_monitor.cancel();
            this.yearly_csv_file_monitor = null;
        }

        if (this.daily_csv_file_monitor_id) {
            this.daily_csv_file_monitor.cancel();
            this.daily_csv_file_monitor = null;
        }

        this.yearly_csv_file = null;
        this.daily_csv_file  = null;

        //
        // Archive the yearly csv file each year
        //
        let t      = new Date();
        let prev_f = this.csv_dir.replace(/^.+?\/\//, '') + '/' +
                                          (t.getFullYear() - 1) +
                                          '__time_tracker.csv';

        if (t.getMonth() === 0 && t.getDate() === 1 &&
            GLib.file_test(prev_f, GLib.FileTest.EXISTS)) {

            let dir = this.csv_dir.replace(/^.+?\/\//, '') + "/YEARS__time_tracker";

            Util.spawnCommandLine("mkdir -p  %s".format(dir));
            Util.spawnCommandLine("mv %s %s".format(prev_f, dir));
        }

        try {
            //
            // create yearly and daily csv files
            //
            this.yearly_csv_file = Gio.file_new_for_path(
                this.csv_dir.replace(/^.+?\/\//, '') + '/' + t.getFullYear() +
                                                            '__time_tracker.csv');

            if (! this.yearly_csv_file.query_exists(null))
                this.yearly_csv_file.create(Gio.FileCreateFlags.NONE, null);

            this.daily_csv_file = Gio.file_new_for_path(
                this.csv_dir.replace(/^.+?\/\//, '') + '/TODAY__time_tracker.csv');

            if (! this.daily_csv_file.query_exists(null))
                this.daily_csv_file.create(Gio.FileCreateFlags.NONE, null);

            //
            // monitor yearly and daily csv files
            //
            this.yearly_csv_file_monitor = this.yearly_csv_file.monitor_file(
                Gio.FileMonitorFlags.NONE, null);

            this.yearly_csv_file_monitor_id = this.yearly_csv_file_monitor.connect(
                'changed', () => { this._on_yearly_csv_file_changed(); });

            this.daily_csv_file_monitor = this.daily_csv_file.monitor_file(
                Gio.FileMonitorFlags.NONE, null);

            this.daily_csv_file_monitor_id = this.daily_csv_file_monitor.connect(
                'changed', () => { this._on_daily_csv_file_changed(); });
        }
        catch (e) {
            global.logError(e);
        }

        //
        // reload daily and yearly csv map
        //
        this.yearly_csv_map = new Map();
        this._init_yearly_csv_map();

        this.daily_csv_map = new Map();
        this._init_daily_csv_map();
    },

    _on_yearly_csv_file_changed: function () {
        this.yearly_csv_map.clear();
        this._init_yearly_csv_map();
    },

    _on_daily_csv_file_changed: function () {
        // @HACK
        // The normal handler_block/unblock methods don't work with a file
        // monitor for some reason. This seems to work well enough.
        if (this.daily_csv_file_monitor_handler_block) {
            Mainloop.idle_add(() => {
                this.file_monitor_handler_block = false;
            });
            return;
        }

        this.stop_all_tracking();
        this.daily_csv_map.clear();
        this._init_daily_csv_map();
    },

    _write_daily_csv_file: function () {
        this.daily_csv_file_monitor_handler_block = true;

        let projects = '';
        let tasks    = '';
        let line, hh, mm;

        for (let [k, v] of this.daily_csv_map.entries()) {
            hh = '' + Math.floor(v.time / 3600);
            hh = (hh.length === 1) ? ('0' + hh) : hh;

            mm = '' + Math.round(v.time % 3600 / 60);
            mm = (mm.length === 1) ? ('0' + mm) : mm;

            line = '' + date_yyyymmdd() + ', ' +
                       hh + ':' + mm    + ', ' +
                       v.type           + ', ' +
                       '"' + k.replace("\"", "'") + '"' + '\n';

            if (v.type === '++') projects += line;
            else                 tasks    += line;
        }

        if (! this.daily_csv_file.query_exists(null))
            this.daily_csv_file.create(Gio.FileCreateFlags.NONE, null);

        this.daily_csv_file.replace_contents(projects + tasks, null, false,
            Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    },

    _archive_daily_csv_file: function () {
        let [, contents]  = this.daily_csv_file.load_contents(null);

        let append_stream = this.yearly_csv_file.append_to(
            Gio.FileCreateFlags.NONE, null);

        append_stream.write_all(contents, null);

        this.daily_csv_file.replace_contents('', null, false,
            Gio.FileCreateFlags.REPLACE_DESTINATION, null);

        for (let [, v] of this.daily_csv_map.entries()) {
            v.date = date_yyyymmdd();
            v.time = 0;
        }
    },

    _get_week_start_date: function () {
        let d       = new Date();
        let day_pos = (7 - Cinnamon.util_get_week_start() + d.getDay()) % 7;

        d.setDate(d.getDate() - day_pos + 1);

        return d.toISOString().substr(0, 10);
    },

    stop_all_tracking: function () {
        if (this.csv_dir === '') return;

        this.number_of_tracked_tasks = 0;

        for (let [k, v] of this.daily_csv_map.entries()) {
            if (v.tracking) {
                v.tracking = false;
                if (v.type === '()') v.task_ref.on_tracker_stopped();
            }
        }
    },

    toggle_tracking: function (task) {
        let val = this.daily_csv_map.get(task.task_str);

        if (val && val.tracking) this.stop_tracking(task);
        else                     this.start_tracking(task);
    },

    start_tracking: function (task) {
        if (this.csv_dir === '') {
            Main.notify(I18N._('To track time, select a dir for csv files in the ' +
                          'settings.'));
            return null;
        }

        let val = this.daily_csv_map.get(task.task_str);

        if (val && val.tracking) return;

        if (val) {
            val.tracking = true;
            val.task_ref = task;
        }
        else {
            this.daily_csv_map.set(task.task_str, {
                time     : 0,
                tracking : true,
                type     : '()',
                task_ref : task,
            });
        }

        if (task.projects) {
            let i = task.projects.length;

            while (i--) {
                val = this.daily_csv_map.get(task.projects[i]);

                if (val) {
                    val.tracking = true;
                    val.tracked_children++;
                }
                else {
                    this.daily_csv_map.set(task.projects[i], {
                        time             : 0,
                        tracking         : true,
                        type             : '++',
                        tracked_children : 1,
                    });
                }
            }
        }

        this.number_of_tracked_tasks++;
        this._start_timers();

        let i = this.delegate.tasks.length;
        while (i--)
            if (this.delegate.tasks[i].task_str === task.task_str)
                this.delegate.tasks[i].on_tracker_started();
    },

    stop_tracking: function (task) {
        if (this.csv_dir === '') return null;

        let val = this.daily_csv_map.get(task.task_str);

        if (!val || !val.tracking) return;

        val.tracking = false;
        this.number_of_tracked_tasks--;

        if (task.projects) {
            let proj;
            let i = task.projects.length;

            while (i--) {
                proj = this.daily_csv_map.get(task.projects[i]);
                if (--proj.tracked_children === 0) proj.tracking = false;
            }
        }

        let i = this.delegate.tasks.length;
        while (i--)
            if (this.delegate.tasks[i].task_str === task.task_str)
                this.delegate.tasks[i].on_tracker_stopped();
    },

    // Swap the old_task_str with the new_task_str in the daily_csv_map only.
    update_record_name: function (old_task_str, new_task_str) {
        if (this.csv_dir === '') return null;

        let val = this.daily_csv_map.get(old_task_str);

        if (! val) return;

        this.daily_csv_map.set(new_task_str, val);
        this.daily_csv_map.delete(old_task_str);

        this._write_daily_csv_file();
    },

    get_all_project_stats: function () {
        if (this.csv_dir === '') return null;

        let stats = [];

        for (let [k, v] of this.yearly_csv_map.entries())
            if (v.type === '++')
                stats.push(this.get_stats(k));

        if (stats.length === 0) stats = null;

        return stats;
    },

    // @needle: string (a task_str or a project keyword)
    get_stats: function (needle) {
        if (!this.csv_dir) return null;

        let yearly_records = this.yearly_csv_map.get(needle);
        yearly_records     = yearly_records ? yearly_records.records : null;

        let todays_record  = this.daily_csv_map.get(needle);
        todays_record      = todays_record ? todays_record.time : 0;

        if (! yearly_records && ! todays_record) return null;

        let stats = {
            name            : needle,
            today           : todays_record,
            last_three_days : todays_record,
            this_week       : todays_record,
            this_month      : todays_record,
            this_year       : todays_record,
        };

        if (! yearly_records) return stats;

        let dates = [
            ['last_three_days', new Date(Date.now() - 172800000).toISOString().substr(0, 10)],
            ['this_week',       this._get_week_start_date()],
            ['this_month',      new Date().toISOString().substr(0, 8) + '01'],
            ['this_year',       new Date().getFullYear() + '-01-01'],
        ];

        let acc = todays_record;
        let i   = yearly_records.length;
        let j, it;

        while (i--) {
            it   = yearly_records[i];
            acc += it.time;

            j = dates.length;

            while (j--) {
                if (dates[j][1] <= it.date) stats[ dates[j][0] ] = acc;
                else dates.splice(j, 1);
            }
        }

        return stats;
    },

    close: function () {
        this.yearly_csv_file_monitor.cancel();
        this.daily_csv_file_monitor.cancel();

        if (this.show_tasks_proc_id) {
            Mainloop.source_remove(this.show_tasks_proc_id);
            this.show_tasks_proc_id = null;
        }

        if (this.timer_seconds_proc_id) {
            Mainloop.source_remove(this.timer_seconds_proc_id);
            this.timer_seconds_proc_id = null;
        }

        if (this.timer_minutes_proc_id) {
            Mainloop.source_remove(this.timer_minutes_proc_id);
            this.timer_minutes_proc_id = null;
        }
    },
};
Signals.addSignalMethods(TimeTracker.prototype);



// =====================================================================
// @@@ View Manager
//
// @applet:   obj (The actual applet objects.)
// @delegate: obj (The main object of this section.)
//
// - The todo section is always in a particular view.
// - A view must be enlisted in the View enum.
// - To switch to a new view, use the show_view function of this object.
// - The current_view is always stored in the current_view var of this obj.
// =====================================================================
function ViewManager(applet, delegate) {
    this._init(applet, delegate);
}

ViewManager.prototype = {
    _init: function(applet, delegate) {
        this.applet   = applet;
        this.delegate = delegate;

        this.current_view   = View.DEFAULT;
        this.actors         = [];
        this.close_callback = () => false;

        this.show_tasks_proc_id = null;
        this.dummy_focus_actor  = new St.Button({ can_focus: false, width: 0, height: 0 });
        this.delegate.todo_pane.addActor(this.dummy_focus_actor);

        this.applet.menu.connect('open-state-changed', (_, state) => {
            if (this.current_view === View.LOADING ||
                this.current_view === View.NO_TODO_FILE) {

                return Clutter.EVENT_PROPAGATE;
            }

            if (state) {
                if (this.delegate.tasks_scroll.visible) this._show_tasks();
            }
            else if (this.delegate.tasks_scroll.visible) this._hide_tasks();

            return Clutter.EVENT_PROPAGATE;
        });
    },

    // @view:
    //   is an object of the form: { view_name      : View,
    //                               actors         : array
    //                               focused_actors : object
    //                               close_callback : func, }
    //
    // When calling this function all properties must be provided.
    //
    // @view_name:
    //   is the name of the new view. Only use the View enum here.
    //
    // @actors:
    //   is an array of all the top-level actors that need to be in the popup
    //   menu. These are the actors that make up the particular view.
    //
    // @focused_actor:
    //   is the actor that will be put into focus when the view is shown.
    //
    // @close_callback:
    //   is a function that is used to close this view when another view needs
    //   to be shown.
    show_view: function (view) {

        // Currently the menu manager closes the popup menu every time the focus
        // is lost.
        // The focus can be lost any time a focused actor is hidden or removed.
        // Since the menu manager has no method to work around this we set key
        // focus on a dummy actor before we hide/remove anything.
        // We also need to make sure that the dummy actor is already in the menu
        // since trying to add it while a large number of tasks is in the menu
        // can be laggy.
        this.dummy_focus_actor.can_focus = true;
        this.dummy_focus_actor.grab_key_focus();

        if (this.delegate.tasks_scroll.visible) this._hide_tasks();

        this.close_callback();

        // set new view
        this.current_view   = view.view_name;
        this.actors         = view.actors;
        this.close_callback = view.close_callback;

        let show_tasks = false;

        for (let i = 0; i < this.actors.length; i++) {
            this.delegate.todo_pane.addActor(this.actors[i]);
            this.actors[i].show();
            if (this.actors[i] === this.delegate.tasks_scroll)
                show_tasks = true;
        }

        if (show_tasks) {
            if (this.delegate.tasks.length !== 0) this._show_tasks();
            else this.delegate.tasks_scroll.hide();
        }

        view.focused_actor.grab_key_focus();

        this.dummy_focus_actor.can_focus = false;
    },

    // @SPEED
    // Showing/adding actors to the popup menu can be somewhat laggy if there
    // are a lot of tasks. To speed things up a bit, each time we need to add,
    // show, hide, or remove actors from the popup menu, we first hide all
    // tasks, do the operation and then show the tasks again.
    //
    // Also, each time the popup menu closes, we hide the tasks, and show them
    // using this func after the menu opens.
    _show_tasks: function () {
        if (! this.applet.menu.isOpen) return;

        this.delegate.tasks_scroll.get_vscroll_bar().get_adjustment().set_value(0);

        let n = Math.min(this.delegate.tasks_viewport.length, 21);

        for (let i = 0; i < n; i++)
            this.delegate.tasks_viewport[i].actor.visible = true;

        this.show_tasks_proc_id = Mainloop.idle_add(() => {
           this._show_tasks__finish(n);
        });
    },

    _show_tasks__finish: function (i) {
        if (! this.applet.menu.isOpen ||
            i === this.delegate.tasks_viewport.length ||
            this.delegate.add_tasks_to_menu_proc_id) {

            this.show_tasks_proc_id = null;
            return;
        }

        this.delegate.tasks_viewport[i].actor.visible = true;

        this.show_tasks_proc_id = Mainloop.idle_add(() => {
            this._show_tasks__finish(++i);
        });
    },

    _hide_tasks: function () {
        if (this.show_tasks_proc_id) {
            Mainloop.source_remove(this.show_tasks_proc_id);
            this.show_tasks_proc_id = null;
        }

        let i = this.delegate.tasks_viewport.length;
        while (i--) this.delegate.tasks_viewport[i].actor.visible = false;
    },
};
Signals.addSignalMethods(ViewManager.prototype);
