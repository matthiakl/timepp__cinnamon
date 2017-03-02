// pad a num and convert it to string
function lpad (num, size) {
    var s = String( Math.abs(num) );

    while (s.length < (size || 2)) {s = '0' + s;}

    if (num < 0) return '-' + s;
    else         return s;
}


