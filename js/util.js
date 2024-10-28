/** Returns an angle in radians given two objects */
export function angleRelative(one, two) { return Math.atan2(one.x-two.x, one.y-two.y); }

/** Hypotenuese, returns distance between 2 points */
export function hypot(one, two) {
    let distX = one.x - two.x;
    let distY = one.y - two.y;
    return [Math.sqrt(distX**2 + distY**2), distX, distY];
}
/** Hypotenuese, returns distance between the centers of 2 objects */
export function hypotCenter(one, two) {
    let distX = (one.x+one.width/2) - (two.x+two.width/2);
    let distY = (one.y+one.width/2) - (two.y+two.width/2);
    return [Math.sqrt(distX**2 + distY**2), distX, distY];
}

export function percentage(partialValue, totalValue) { return (100 * partialValue) / totalValue; }