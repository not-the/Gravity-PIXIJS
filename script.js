// PIXI.js Setup
let app = new PIXI.Application({ width: 1200, height: 672 });
app.renderer.background.color = 0x111111;
PIXI.BaseTexture.defaultOptions.scaleMode = PIXI.SCALE_MODES.NEAREST;
document.getElementById('game').appendChild(app.view);

let mouse = {
    s: {
        x: 0, y: 0,
        width: 0, height: 0,
    },
    mass: 1,
    grav_law: 1.01,
}

var pressed = {}
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
        this.id = entityID;
        
        this.grav_law = 1.01;

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
// new Planet();

// Tick
let elapsed = 0.0;
// let cycle = 0;

app.ticker.add(gameTick);
function gameTick(delta) {
    elapsed += delta;
    // cycle++;

    // Loop planets
    for(const [id, pl] of Object.entries(entities)) {
        // Held in place
        if(pressed['rclick'] && pl.id === entityID-1) accelerate(pl, mouse);

        // Loop other planets and have them pull on the current planet
        else  {
            for(const [id_influencer, pl_influencer] of Object.entries(entities)) {
                accelerate(pl, pl_influencer, id, id_influencer);
            }
        }

        // Bounce off walls
        // ...

        motion(pl);
    }

    /** Apply Motion */
    function motion(pl) {
        pl.s.x += pl.motion.x * delta;
        pl.s.y += pl.motion.y * delta;
    }

    /** Accelerate */
    function accelerate(pl, pl_influencer, id=-1, id_influencer=-2) {
        if(id === id_influencer) return;

        // Accelerate
        let [distance, distX, distY] = hypot(pl_influencer.s, pl.s);
        if(distance === 0) {
            distance = 0.001;
            distX = 0.001;
            distY = 0.001;
        }
        const share = {
            x: percentage(distX, distance)/100,
            y: percentage(distY, distance)/100,
        }


        let pull = Math.pow(pl_influencer.grav_law, distance*-1) * pl_influencer.mass * delta;
        pl.motion.x += pull*share.x;
        pl.motion.y += pull*share.y;
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
const canvas = document.querySelector('canvas');
canvas.addEventListener('mousemove', event => {
    const rect = canvas.getBoundingClientRect();
    [mouse.s.x, mouse.s.y] = [
        event.clientX-rect.left / app.stage.scale.x,
        event.clientY-rect.top / app.stage.scale.y,
    ];
})

canvas.addEventListener('mousedown', event => {
    pressed['rclick'] = true;
    let np = new Planet(undefined, mouse.s.x, mouse.s.y, Math.ceil(Math.random() * 16777215));
})
document.addEventListener('mouseup', event => {
    pressed['rclick'] = false;

    document.getElementById('hint').classList.add('fade');
})

// Mouse wheel
document.querySelector('canvas').addEventListener('wheel', event => {
    event.preventDefault();

    let dir = Math.sign(event.deltaY)*-1;
    let multiplier = dir === 1 ? 1.25 : 0.8;
    app.stage.scale.x *= multiplier;
    app.stage.scale.y *= multiplier;
})
