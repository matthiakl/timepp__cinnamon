**This project is no longer maintained.**


A [todo.txt manager](https://github.com/ginatrapani/todo.txt-cli/wiki/The-Todo.txt-Format),
time tracker, timer, stopwatch, pomodoro, and alarms applet for 
[cinnamon](https://github.com/linuxmint/Cinnamon/tree/master/js/ui).

Gnome-shell extension version: https://github.com/zagortenay333/timepp__gnome

---

### Installation

Clone/download this repo into your `~/.local/share/cinnamon/applets` dir and
rename the downloaded folder to `timepp@zagortenay333`.

---

### Compatibility

The latest version of this applet is on the master branch, and it supports
cinnamon version `3.2`.

---

### Sections

Each section (timer, stopwatch, alarms..) can open as a separate menu when it's
icon is clicked, or it can appear together with other sections in one menu.

Each section can be disabled via the panel context menu.

---

### Todo.txt Manager

Some of the features of the todo.txt manager are:

* Fuzzy task searching.
* Filtering by context, project, priority, custom fuzzy filters...
* Activating a filter by clicking on a priority, context, or proj in the task.
* Sorting by priority, due date, completion date, creation date.
* Fuzzy autocompletion for contexts and projects when inline editing a task.
* Autoupdating when the todo.txt file changes.
* Deleting all completed tasks and optionally storing them into a done.txt file.
* Switching between different views via keyboard shortcuts.

The todo.txt manager also supports the `h:1` extension for hiding a task and the
`due|DUE:yyyy-mm-dd` extension.

---

### Time Tracker

The time tracker is built into the todo.txt manager and allows you to track the
time spent on a particular task as well as the time spent on a particular project.

When pressing the play button to track a task, all projects associated with that
task will also be tracked.

At the start of each year, the current yearly csv file will be archived and a 
new file will be started.

There is also a daily csv file which gets appended to the yearly file at the 
start of each day.

> **NOTE:**  
> When editing a task that has been time-tracked, only the corresponding entry
in the daily csv file will be updated. The yearly csv file will not be changed.

> **HINT:**  
> There is an option to pause the time tracker when the pomodoro stops!

You can also see how much time you spent working on a task today, this week, 
this month, this year, etc, or do the same for all projects in the current year.

The csv file has the form:

```csv
date, time spent (hh:mm), type ('++' = project, '()' = task), task or project

2017-02-04, 08:03, ++, "+my_project"
2017-02-04, 23:59, ++, "+protect_gotham"
2017-02-04, 02:03, ++, "+protect_gotham"
2017-02-04, 02:03, (), "(A) Watch the world burn."
2017-02-04, 02:03, (), "(A) Catch Joker."
2017-02-04, 02:03, (), "(Z) Take the trash out."
2017-02-05, 08:03, ++, "+my_project"
2017-02-05, 23:59, ++, "+protect_gotham"
2017-02-05, 02:03, ++, "+protect_gotham"
2017-02-05, 02:03, (), "(A) Watch the world burn."
2017-02-05, 02:03, (), "x 2017-02-05 Catch Joker."
2017-02-05, 02:03, (), "(Z) Take the trash out."
.
.
.
```

---

### Pango markup

The todo.txt manager, timer and alarm support [pango markup](https://developer.gnome.org/pango/stable/PangoMarkupFormat.html).


> **NOTE:**  
> The pango markup will appear in the `todo.txt` file as well if used in the 
todo.txt manager.

---

### Development

The `watch` script will watch the chosen dirs for changes and reload the applet
when a change occurs.  
The xdotool command can be enabled to open the applet on change.

> **Script dependencies:**
> * inotifywait
> * xdotools _(if enabled in the script)_

---

![preview](https://i.imgur.com/GssjcSH.png)
<sup>**Preview info:** [Cinnamon theme](https://github.com/zagortenay333/ciliora-tertia-cinnamon)</sup>
