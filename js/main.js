// DOM
const elGame = document.getElementById('game');
// const inTrails = document.getElementById('trails');

// PIXI.js Setup
const app = new PIXI.Application({ resizeTo:elGame });
app.renderer.background.color = 0x111111;
PIXI.BaseTexture.defaultOptions.scaleMode = PIXI.SCALE_MODES.NEAREST;
elGame.appendChild(app.view);

// Normals
// const normalShader = document.getElementById("fragShader").innerHTML;
// const ball_normal = PIXI.BaseTexture.from('./assets/ball_normal.png');

// Modules
import Planet from "./Planet.js"
import { hypotCenter, angleRelative } from "./util.js"


/** Game variables & methods */
const game = {
    // Step
    elapsed: 0.0,
    delta: 1,

    // Controls
    pressed: {},
    mouse: {
        s: {
            x: 0, y: 0,
            width: 0, height: 0,
        },
        mass: 1,
        grav_law: 1.01,
    },
    
    // User
    brush: 'planet',
    dragging: undefined,
    ropeSelection: undefined,

    // Game
    entities: {},
    entityID: 0,
    particles: {},
    particleID: 0,

    ropes: {},
    ropeID: 0,

    tickRopeSprites() {
        for(const key in this.ropes) {
            const rope = this.ropes[key];

            const distance = hypotCenter(rope.one.s, rope.two.s)[0];
            const center = rope.one.center;
            rope.visual.x = center[0]-3;
            rope.visual.y = center[1]-3;
            rope.visual.scale.y = distance;
            rope.visual.angle = -angleRelative(rope.one.s, rope.two.s) * 180 / Math.PI + 180;
        }
    }
}

const config = {
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

// Update config on page
document.querySelectorAll('[data-config]').forEach(element => {
    const vName = element.type === 'checkbox' ? 'checked' : 'value';
    element[vName] = config[element.id];
    element.addEventListener('change', event => {
        let value = element[vName];
        if(element.type === 'number') value = Number(value);
        config[element.id] = value;
        if(store('main_cookies') === 'true') store('gravity_toy_config', JSON.stringify(config));
    })
})

// Brushes
document.querySelectorAll('[data-brush]').forEach(element => {
    if(element.dataset.brush === game.brush) element.classList.add('active');
    element.addEventListener('click', event => {
        document.querySelectorAll('.active[data-brush]').forEach(rel => rel.classList.remove('active'));
        game.brush = event.srcElement.dataset.brush;
        event.srcElement.classList.add('active');
    })
})


// Containers
const container = {
    main: new PIXI.Container(),
    trails: new PIXI.Container(),
    planets: new PIXI.Container(),
}
container.main.pivot.x = app.view.width/2;
container.main.pivot.y = app.view.height/2;
container.main.x = app.view.width/2;
container.main.y = app.view.height/2;

container.main.addChild(container.trails);
// trailsContainer.zIndex = 0;
container.main.addChild(container.planets);
// planetContainer.zIndex = 1;



app.stage.addChild(container.main);

const in_planet_size = document.getElementById('planet_size');


// Export variables
export { app, game, config, in_planet_size, container }



// Demo
if(!store('gravity_toy_config')) {
    const pl1 = new Planet(undefined, app.view.width/2-12, 100);
    const pl2 = new Planet(undefined, app.view.width/2-150, 200);
    const pl3 = new Planet(undefined, app.view.width/2-20, 350);
    pl1.pin();
    pl2.ropeTo(pl1);
    pl3.ropeTo(pl2);
}


// Tick
app.ticker.add(gameTick);
function gameTick(d) {
    game.elapsed += game.delta;
    game.delta = d;
    game.delta *= config.game_speed;

    // Loop
    for(const [id, pl] of Object.entries(game.entities)) if(!config.pause || pl.dragging) pl.tick(); // Planets

    if(config.pause) return;
    for(const [id, part] of Object.entries(game.particles)) part.tick(); // Particles

    game.tickRopeSprites();
}

function clearScreen() {
    for(const [id, pl] of Object.entries(game.entities)) pl.despawn(); // Planets
    for(const [id, part] of Object.entries(game.particles)) part.despawn(); // Particles
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
    [game.mouse.s.x, game.mouse.s.y] = [
        event.clientX-rect.left / app.stage.scale.x,
        event.clientY-rect.top / app.stage.scale.y,
    ];
}

canvas.addEventListener('pointerdown', event => {
    game.pressed['rclick'] = true;
    if(game.brush === 'planet' && !game.dragging) {
        const off = in_planet_size.value;
        const np = new Planet(undefined, game.mouse.s.x-off, game.mouse.s.y-off);
    }
})
document.addEventListener('pointerup', event => {
    game.pressed['rclick'] = false;
    game?.dragging?.endDrag();

    document.getElementById('hint').classList.add('fade');
})
document.addEventListener('keydown', event => {
    if(event.key === ' ') event.preventDefault();
})
document.addEventListener('keyup', event => {
    const ae = document.activeElement;
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
    if(event.ctrlKey) return;
    event.preventDefault();

    const dir = Math.sign(event.deltaY)*-1;
    const multiplier = dir === 1 ? 1.25 : 0.8;
    container.main.scale.x *= multiplier;
    container.main.scale.y *= multiplier;
})
var elScrTools = document.querySelector('.scrollable');

elScrTools.addEventListener('wheel', event => {
    if(event.ctrlKey) return;
    event.preventDefault();

    const pos = elScrTools.scrollLeft + event.deltaY;
    elScrTools.scrollTo({left:pos, behavior:'auto'});
});

// Buttons
document.getElementById("button_clear").addEventListener("click", clearScreen);
document.getElementById("button_reset").addEventListener("click", reset);
