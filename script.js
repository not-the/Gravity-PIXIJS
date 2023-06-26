// PIXI.js Setup
let app = new PIXI.Application({ width: 1200, height: 672 });
app.renderer.background.color = 0x111111;
PIXI.BaseTexture.defaultOptions.scaleMode = PIXI.SCALE_MODES.NEAREST;
document.getElementById('game').appendChild(app.view);

let mouse = {
    x: 0,
    y: 0,
}


var entities = {}
var entityID = 0;
class Planet {
    constructor(mass=0.05, x=500, y=500, color=0xffffff) {
        // Prep
        let size = mass*200; // Size and mass are the same number for now

        // Sprite
        this.s = new PIXI.Graphics();
        this.s.beginFill(color);

        this.s.drawCircle(size, size, size);
        this.s.endFill();
        this.s.x = x;
        this.s.y = y;

        // Game
        this.mass = mass;
        this.motion = { x: 0, y: 0, r: 0 };
        app.stage.addChild(this.s);

        // Add to list
        entities[entityID] = this;
        entityID++;
    }
}


// Planet 1
new Planet();


// Tick
let elapsed = 0.0;
// let cycle = 0;

app.ticker.add(gameTick);
function gameTick(delta) {
    elapsed += delta;
    // cycle++;

    // Loop planets
    for(const [id, pl] of Object.entries(entities)) {
        // Loop other planets and have them pull on the current planet
        for(const [id_influencer, pl_influencer] of Object.entries(entities)) {
            if(id === id_influencer) continue;

            // Accelerate
            let [distance, distX, distY] = hypot(pl_influencer.s, pl.s);
            const share = {
                x: percentage(distX, distance)/100,
                y: percentage(distY, distance)/100,
            }

            let pull = Math.pow(1.01, distance*-1) * pl_influencer.mass;
            pl.motion.x += pull*share.x;
            pl.motion.y += pull*share.y;
        }

        // Apply Motion
        pl.s.x += pl.motion.x;
        pl.s.y += pl.motion.y;
    }
}


/** Hypotenuese, returns distance between 2 objects */
function hypot(one, two) {
    // let distX = one.x+(one.width/2) - two.x+(two.width/2);
    // let distY = one.y+(one.height/2) - two.y+(two.height/2);
    let distX = one.x - two.x;
    let distY = one.y - two.y;
    return [Math.sqrt(distX**2 + distY**2), distX, distY];
}

function percentage(partialValue, totalValue) { return (100 * partialValue) / totalValue; }


// Event Listeners
document.addEventListener('mousemove', event => {
    [mouse.x, mouse.y] = [event.clientX, event.clientY];

})
document.addEventListener('click', event => {
    let np = new Planet(undefined, mouse.x, mouse.y, Math.ceil(Math.random() * 16777215));
})