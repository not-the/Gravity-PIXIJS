// PIXI.js Setup
const elGame = document.getElementById('game');
// let app = new PIXI.Application({ width: 1200, height: 672 });
let app = new PIXI.Application({ resizeTo:elGame });
app.renderer.background.color = 0x111111;
PIXI.BaseTexture.defaultOptions.scaleMode = PIXI.SCALE_MODES.NEAREST;

// const normalShader = document.getElementById("fragShader").innerHTML;

var ball_normal = PIXI.BaseTexture.from('./assets/ball_normal.png');

elGame.appendChild(app.view);

/** Returns an angle in radians given two objects */
function angleRelative(one, two) { return Math.atan2(one.x-two.x, one.y-two.y); }

let mouse = {
    s: {
        x: 0, y: 0,
        width: 0, height: 0,
    },
    mass: 1,
    grav_law: 1.01,
}
let elapsed = 0.0;
let delta = 1;

let user = {
    dragging: undefined,
}

const inTrails = document.getElementById('trails');
let config = {
    pause: false,
    game_speed: 1,

    planet_size: 25,
    planetGravityMultiplier: 0,
    trails: true,
    do_planet_collision: true,

    worldGravity: 0.5,
    wallBounce: 0.6,
    edgeBehavior: 'collide',
    airFriction: 0.01,
    // wallFriction: 2,

    rope_length: 100,
    stiff_rope: false,

    ...JSON.parse(store('gravity_toy_config')) ?? {}
}
document.querySelectorAll('[data-config]').forEach(element => {
    let vName = element.type === 'checkbox' ? 'checked' : 'value';
    element[vName] = config[element.id];
    element.addEventListener('change', event => {
        let value = element[vName];
        if(element.type === 'number') value = Number(value);
        config[element.id] = value;
        if(store('main_cookies') === 'true') store('gravity_toy_config', JSON.stringify(config));
    })
})

// Brushes
let brush = 'planet';
document.querySelectorAll('[data-brush]').forEach(element => {
    if(element.dataset.brush === brush) element.classList.add('active');
    element.addEventListener('click', event => {
        document.querySelectorAll('.active[data-brush]').forEach(rel => rel.classList.remove('active'));
        brush = event.srcElement.dataset.brush;
        event.srcElement.classList.add('active');
    })
})

/** Hypotenuese, returns distance between 2 points */
function hypot(one, two) {
    let distX = one.x - two.x;
    let distY = one.y - two.y;
    return [Math.sqrt(distX**2 + distY**2), distX, distY];
}
/** Hypotenuese, returns distance between the centers of 2 objects */
function hypotCenter(one, two) {
    let distX = (one.x+one.width/2) - (two.x+two.width/2);
    let distY = (one.y+one.width/2) - (two.y+two.width/2);
    return [Math.sqrt(distX**2 + distY**2), distX, distY];
}

function percentage(partialValue, totalValue) { return (100 * partialValue) / totalValue; }


const container = new PIXI.Container();
container.pivot.x = app.view.width/2;
container.pivot.y = app.view.height/2;
container.x = app.view.width/2;
container.y = app.view.height/2;

const trailsContainer = new PIXI.Container();
container.addChild(trailsContainer);
// trailsContainer.zIndex = 0;

const planetContainer = new PIXI.Container()
container.addChild(planetContainer);
// planetContainer.zIndex = 1;



app.stage.addChild(container);

const in_planet_size = document.getElementById('planet_size');

var pressed = {}
var entities = {}
var entityID = 0;
var particles = {}
var particleID = 0;
class Planet {
    constructor(mass=in_planet_size.value/200, x=500, y=500, color=Math.ceil(Math.random() * 16777215)) {
        // Prep
        let size = mass*200; // Size and mass are the same number for now

        // Sprite
        this.s = new PIXI.Graphics();
        this.s.beginFill(color);

        this.s.drawCircle(size, size, size).endFill();
        this.s.x = x;
        this.s.y = y;
        this.color = color;
        this.s.zIndex = entityID;
        this.id = entityID;
        
        this.grav_law = 1.01;

        // Game
        this.mass = mass;
        this.motion = { x: 0, y: 0, r: 0 };
        // app.stage.addChild(this.s);
        planetContainer.addChild(this.s);

        // Clickable
        this.s.eventMode = 'static';
        this.s.buttonMode = true;
        this.s.cursor = 'pointer';
        this.s.on('pointerdown', e => {
            if(brush === 'erase') this.despawn();
            else if(brush === 'grab') this.drag();
            else if(brush === 'rope') {
                if(user.ropeSelection) {
                    if(!this.roped) user.ropeSelection?.ropeTo(this);
                    else if(!user.ropeSelection.roped) this.ropeTo(user.ropeSelection());
                    user.ropeSelection = undefined;
                }
                else user.ropeSelection = this;
            }
            else if(brush === 'pin') this.pin();
        });

        // Add to list
        entities[entityID] = this;
        entityID++;
        if(pressed['rclick']) this.drag();
    }

    get center() {
        return [ this.s.x+this.s.width/2, this.s.y+this.s.height/2 ]
    }
    get speed() {
        return hypot(this.motion, {x:0,y:0})[0];
    }

    drag() {
        this.dragging = true;
        user.dragging = this;
    }
    endDrag() {
        this.dragging = false;
        user.dragging = undefined;
    }

    pin(state) {
        this.pinned = state ?? !this.pinned
        if(this.pinned) {
            this.motion = {x:0,y:0};

            this.pinVisual = new PIXI.Graphics();
            this.pinVisual.beginFill(0xcccccc).drawCircle(0,0, 6, 6).endFill();
            this.pinVisual.beginFill(0xff6644).drawCircle(0,0, 5, 5).endFill();
            this.pinVisual.x = this.s.width/2;
            this.pinVisual.y = this.s.height/2;
            this.s.addChild(this.pinVisual);
        } else this.removePinVisual();
    }

    tick() {
        let speed = this.speed;
        let strongerFartherFunc = (influencer, distance) => {
            let pull = Math.pow(influencer.grav_law, distance*2) * influencer.mass * delta;
            if(pull > 50) pull = 50;
            return pull;
        };

        //// GRAVITY
        // Held in place
        if(this.dragging) {
            this.motion.x /= 2;
            this.motion.y /= 2;
            this.accelerate(mouse, undefined, strongerFartherFunc);
            // this.s.x = mouse.s.x;
            // this.s.y = mouse.s.y;
        }
        // Loop other planets and have them pull on the current planet
        else {
            // Interactions
            for(const influencer of Object.values(entities)) {
                if(this.id === influencer.id) continue;

                // Planet gravity
                this.accelerate(influencer, config.planetGravityMultiplier);

                // Collision
                if(!config.do_planet_collision) continue;
                let [distance, distX, distY] = hypotCenter(influencer.s, this.s);
                let share = {
                    x: percentage(distX, distance)/100,
                    y: percentage(distY, distance)/100,
                }
                if(distance < this.s.width) {
                    this.accelerate(influencer, -10);
                    influencer.accelerate(this, -10);
                }
            }
        }

        // Ropes
        if(this.roped) {
            let ropePullFunc = (influencer, distance) => {
                let strength = config.stiff_rope ? 0.5 : 0.1;
                distance -= config.rope_length;
                let pull = Math.pow(influencer.grav_law, distance*2) * strength * delta;
                if(pull > 5 && !config.stiff_rope) pull = 5;
                if(distance <= 0) {
                    if(config.stiff_rope) pull *= -2;
                    else return 0;
                }
                return pull;
            };
            this.accelerate(this.roped, undefined, ropePullFunc);
            this.roped.accelerate(this, undefined, ropePullFunc);

            this.updateRopeVisual();
        }

        const actOutCollision = (axis='y', limit, operator='>') => {
            if(operator === '>' ? this.s[axis] > limit : this.s[axis] < limit) {
                this.s[axis] = limit - (operator === '>' ? 1 : -1);
                this.motion[axis] *= -config.wallBounce;
            }
        }

        // Bounce off walls
        if(config.edgeBehavior.startsWith('collide')) {
            actOutCollision('y', app.view.height-this.s.height, '>'); // Down
            if(config.edgeBehavior === 'collide') actOutCollision('y', 0, '<'); // Up
            actOutCollision('x', 0, '<'); // Left
            actOutCollision('x', app.view.width-this.s.width, '>'); // Right
        }
        // Despawn when out of bounds
        else if(
            this.s.y < 0-this.s.height || // Down
            this.s.y > app.view.height+this.s.height || // Up
            this.s.x < 0-this.s.width || // Left
            this.s.x > app.view.width+this.s.width // Right
        ) this.despawn();

        // World gravity
        if(!this.pinned) {
            this.motion.y += config.worldGravity * delta;
            this.motion.x -= this.motion.x * config.airFriction * delta;
            this.motion.y -= this.motion.y * config.airFriction * delta;
        }
        if(!this.pinned || this.dragging) this.runMotion(); // Apply motion

        // Squash and stretch
        // this.s.scale.y = 1 - (speed/100);
        // if(this.s.scale.y < 0.5) this.s.scale.y = 0.5;
        // this.s.angle = this.angle * 180 / Math.PI + 180;

        // Trail
        if(config.trails) {
            let alpha = speed/500;
            new Trail(...this.center, alpha, this.s.width/2, this.color);
        }
    }

    // get angle() {
    //     return (Math.atan2(this.motion.x, this.motion.y) * 360 / Math.PI);
    // }

    updateRopeVisual() {
        let distance = hypotCenter(this.s, this.roped.s)[0];
        let center = this.center;
        this.ropeVisual.x = center[0]-3;
        this.ropeVisual.y = center[1]-3;
        this.ropeVisual.scale.y = distance;
        this.ropeVisual.angle = -angleRelative(this.s, this.roped.s) * 180 / Math.PI + 180;
    }

    runMotion() {
        this.s.x += this.motion.x * delta;
        this.s.y += this.motion.y * delta;
    }

    ropeTo(subject) {
        this.roped = subject;
        this.ropeVisual = new PIXI.Graphics();
        this.ropeVisual.beginFill(0xffffff).drawRect(0,0, 6, 1).endFill();
        this.ropeVisual.x = this.s.x;
        this.ropeVisual.y = this.s.y;
        planetContainer.addChild(this.ropeVisual);

        this.updateRopeVisual();
    }
    detach() {
        if(this.roped === undefined) return;
        this.ropeVisual.parent.removeChild(this.ropeVisual);
        this.ropeVisual = undefined;
        this.roped = undefined;
    }

    /** Accelerate towards another object */
    accelerate(influencer, multiplier=1, pullFunc=(influencer, distance) => Math.pow(influencer.grav_law, distance*-1) * influencer.mass * delta) {
        if(multiplier === 0) return;
        // Accelerate
        let [distance, distX, distY] = hypotCenter(influencer.s, this.s);
        if(distance === 0) {
            distance = 0.001;
            distX = 0.001;
            distY = 0.001;
        }
        const share = {
            x: percentage(distX, distance)/100,
            y: percentage(distY, distance)/100,
        }

        let pull = pullFunc(influencer, distance);
        this.motion.x += pull*multiplier*share.x;
        this.motion.y += pull*multiplier*share.y;
    }

    removePinVisual() {
        if(this.pinVisual === undefined) return;
        this.pinVisual.parent.removeChild(this.pinVisual);
        this.pinVisual = undefined;
    }

    despawn() {
        this.s.parent.removeChild(this.s);
        delete entities[this.id];
        this.removePinVisual();
        this.detach();
    }
}
class Trail {
    constructor(x=500, y=500, alpha=0.5, size=2, color=0xffffff) {
        // Sprite
        this.s = new PIXI.Graphics();
        this.s.beginFill(color);

        this.s.drawCircle(size, size, size);
        this.s.endFill();
        this.s.x = x-this.s.width/2;
        this.s.y = y-this.s.height/2;
        this.s.alpha = alpha;
        this.id = particleID;
        trailsContainer.addChild(this.s);

        // let time = elapsed;
        // let expires = elapsed + 10;

        // Add to list
        particles[particleID] = this;
        particleID++;
    }

    tick() {
        let sw = this.s.width;
        this.s.width -= this.s.width * 0.02 * delta;
        this.s.height -= this.s.height * 0.02 * delta;
        let off = (sw-this.s.width)/2;
        this.s.x += off; this.s.y += off;
        this.s.alpha -= 0.01 * delta;
        if(this.s.alpha <= 0) this.despawn();
    }

    despawn() {
        this.s.parent.removeChild(this.s);
        delete particles[this.id];
    }
}

// Demo
if(!store('gravity_toy_config')) {
    let pl1 = new Planet(undefined, app.view.width/2-12, 100);
    let pl2 = new Planet(undefined, app.view.width/2-150, 200);
    let pl3 = new Planet(undefined, app.view.width/2-20, 350);
    pl1.pin();
    pl2.ropeTo(pl1);
    pl3.ropeTo(pl2);
}


// Tick
app.ticker.add(gameTick);
function gameTick(d) {
    elapsed += delta;
    delta = d;
    delta *= config.game_speed;

    // Loop
    for(const [id, pl] of Object.entries(entities)) if(!config.pause || pl.dragging) pl.tick(); // Planets

    if(config.pause) return;
    for(const [id, part] of Object.entries(particles)) part.tick(); // Particles
}

function clearScreen() {
    for(const [id, pl] of Object.entries(entities)) pl.despawn(); // Planets
    for(const [id, part] of Object.entries(particles)) part.despawn(); // Particles
}
function reset() {
    localStorage.removeItem('gravity_toy_config');
    location.reload();
}

// Event Listeners
const canvas = document.querySelector('canvas');
canvas.addEventListener('pointermove', pointerHandler);
canvas.addEventListener('pointerdown', pointerHandler);
canvas.addEventListener('pointerup', pointerHandler);
function pointerHandler(event) {
    const rect = canvas.getBoundingClientRect();
    [mouse.s.x, mouse.s.y] = [
        event.clientX-rect.left / app.stage.scale.x,
        event.clientY-rect.top / app.stage.scale.y,
    ];
}

canvas.addEventListener('pointerdown', event => {
    pressed['rclick'] = true;
    if(brush === 'planet' && !user.dragging) {
        let off = in_planet_size.value;
        let np = new Planet(undefined, mouse.s.x-off, mouse.s.y-off);
    }
})
document.addEventListener('pointerup', event => {
    pressed['rclick'] = false;
    user?.dragging?.endDrag();

    document.getElementById('hint').classList.add('fade');
})
document.addEventListener('keydown', event => {
    if(event.key === ' ') event.preventDefault();
})
document.addEventListener('keyup', event => {
    let ae = document.activeElement;
    if(ae.tagName === 'INPUT' || ae.tagName === 'SELECT') return;
    document.querySelector(`[data-key="${event.key}"]`)?.click();
})

const inPlayPause = document.getElementById('play_pause');
inPlayPause.addEventListener('click', () => {
    config.pause = !config.pause;
    inPlayPause.children[0].innerText = config.pause ? '⏵' : '⏸';
})


// Mouse wheel
document.querySelector('canvas').addEventListener('wheel', event => {
    event.preventDefault();

    let dir = Math.sign(event.deltaY)*-1;
    let multiplier = dir === 1 ? 1.25 : 0.8;
    container.scale.x *= multiplier;
    container.scale.y *= multiplier;
})
var elScrTools = document.querySelector('.scrollable');

elScrTools.addEventListener('wheel', event => {
    event.preventDefault();
    let pos = elScrTools.scrollLeft + event.deltaY;
    elScrTools.scrollTo({left:pos, behavior:'auto'});
});
