import { app, game, config, container, in_planet_size } from "./main.js"
import { hypot, hypotCenter, angleRelative } from "./util.js"
import Trail from "./Trail.js"


const standardPullFunc = function(influencer, distance) {
    return Math.pow(influencer.grav_law, distance*-1) * influencer.mass * game.delta;
}


/** Planet/ball object */
export default class Planet {
    /** Planet constructor
     * @param {Number} mass Value is used only determine size for now
     * @param {Number} x 
     * @param {Number} y 
     * @param {Number} color 
     */
    constructor(mass=in_planet_size.value/200, x=500, y=500, color=Math.ceil(Math.random() * 16777215)) {
        // Prep
        const size = mass*200; // Size and mass are the same number for now

        // Sprite
        this.s = new PIXI.Graphics();
        this.s.beginFill(color);

        this.s.drawCircle(size, size, size).endFill();
        this.s.x = x;
        this.s.y = y;
        this.prevPosition = { x, y };
        this.color = color;
        this.s.zIndex = game.entityID;
        this.id = game.entityID;
        
        /** Square cube law constant (?) number is altered from real life */
        this.grav_law = 1.01;

        // Game
        this.mass = mass;
        this.motion = { x: 0, y: 0, r: 0 };
        this.ropes = [];
        // app.stage.addChild(this.s);
        container.planets.addChild(this.s);

        // Clickable
        this.s.eventMode = 'static';
        this.s.buttonMode = true;
        this.s.cursor = 'pointer';
        this.s.on('pointerdown', e => {
            if(game.brush === 'erase') this.despawn();
            else if(game.brush === 'grab') this.drag();
            else if(game.brush === 'rope') {
                if(game.ropeSelection) {
                    if(!this.roped) game.ropeSelection?.ropeTo(this);
                    else if(!game.ropeSelection.roped) this.ropeTo(game.ropeSelection());
                    game.ropeSelection = undefined;
                }
                else game.ropeSelection = this;
            }
            else if(game.brush === 'pin') this.pin();
        });

        // Add to list
        game.entities[game.entityID] = this;
        game.entityID++;
        if(game.pressed['rclick']) this.drag();
    }

    /** An array [x, y] representing the planet's center */
    get center() {
        return [ this.s.x+this.s.width/2, this.s.y+this.s.height/2 ]
    }

    /** Gets current speed relative to screen */
    get speed() {
        return hypot(this.motion, {x:0,y:0})[0];
    }

    /** Starts click-and-drag state */
    drag() {
        this.dragging = true;
        game.dragging = this;
    }

    /** Ends click-and-drag state */
    endDrag() {
        this.dragging = false;
        game.dragging = undefined;
    }

    /** Pins the planet in place
     * @param {Boolean} state Boolean determining whether to pin or unpin
     */
    pin(state) {
        this.pinned = state ?? !this.pinned;
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

    /** Ticks the planet once */
    tick() {
        const speed = this.speed;
        const strongerFartherFunc = (influencer, distance) => {
            let pull = Math.pow(influencer.grav_law, distance*2) * influencer.mass * game.delta;
            if(pull > 50) pull = 50;
            return pull;
        };

        //// GRAVITY
        // Held in place
        if(this.dragging) {
            this.motion.x /= 2;
            this.motion.y /= 2;
            this.accelerate(game.mouse, undefined, strongerFartherFunc);
            // this.s.x = mouse.s.x;
            // this.s.y = mouse.s.y;
        }
        // Loop other planets and have them pull on the current planet
        else {
            // Interactions
            for(const influencer of Object.values(game.entities)) {
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

        // Rope physics
        if(this.ropes.length > 0) {
            // Loop ropes
            for(const rope of this.ropes) {
                // if(rope.responsible !== this) continue;

                // Normal acceleration function
                const ropePullFunc = (influencer, distance) => {
                    // Strength
                    const strength = config.stiff_rope ? 0.5 : 0.1;
                    distance -= config.rope_length;
    
                    // Calculate pull
                    let pull = Math.pow(influencer.grav_law, distance*2) * strength * game.delta;
                    if(pull > 5 && !config.stiff_rope) pull = 5;
                    if(distance <= 0) {
                        if(config.stiff_rope) pull *= -2;
                        else return 0;
                    }
    
                    // Return pull strength
                    return pull;
                };

                // Accelerate
                this.accelerate(rope.to, undefined, ropePullFunc);
    
                // Update sprite
                // this.updateRopeVisual(rope);
            }
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
            this.motion.y += config.worldGravity * game.delta;
            this.motion.x -= this.motion.x * config.airFriction * game.delta;
            this.motion.y -= this.motion.y * config.airFriction * game.delta;
        }
        if(!this.pinned || this.dragging) this.runMotion(); // Apply motion

        // Squash and stretch
        // this.s.scale.y = 1 - (speed/100);
        // if(this.s.scale.y < 0.5) this.s.scale.y = 0.5;
        // this.s.angle = this.angle * 180 / Math.PI + 180;

        // Trail
        if(config.trails) {
            const color = this.color;
            const size = this.s.width/2;
            const alpha = Math.min(speed/1000, 0.02);
            // const alpha = 0.025;

            // Inbetween
            const [dist, distX, distY] = hypot(this.s, this.prevPosition);

            // Draw line between points
            const trailResolution = 0.25;
            const steps = Math.floor(dist*trailResolution);
            for(let i = 0; i < steps; i++) {
                const progress = i/steps;
                const pos = {
                    x: Math.ceil(this.s.x + distX * progress),
                    y: Math.ceil(this.s.y + distY * progress)
                }

                // Create trail
                new Trail(pos.x+(this.s.width/2), pos.y+(this.s.height/2), alpha, size, color);
            }

            new Trail(...this.center, alpha, size, color);
        }
    }

    // get angle() {
    //     return (Math.atan2(this.motion.x, this.motion.y) * 360 / Math.PI);
    // }

    /** Ticks the rope visualization */
    updateRopeVisual(rope) {
        return;
        const distance = hypotCenter(this.s, rope.to.s)[0];
        const center = this.center;
        this.ropeVisual.x = center[0]-3;
        this.ropeVisual.y = center[1]-3;
        this.ropeVisual.scale.y = distance;
        this.ropeVisual.angle = -angleRelative(this.s, rope.to.s) * 180 / Math.PI + 180;
    }

    /** Applies motion to X/Y position */
    runMotion() {
        // Save previous position
        this.prevPosition = { x:this.s.x, y:this.s.y };

        // Update position
        this.s.x += this.motion.x * game.delta;
        this.s.y += this.motion.y * game.delta;
    }

    /** Ropes two planets together
     * @param {Planet} subject Planet to attach to
     */
    ropeTo(subject) {
        // Create visualization
        const visual = new PIXI.Graphics();
        visual.beginFill(0xffffff).drawRect(0,0, 6, 1).endFill();
        visual.x = this.s.x;
        visual.y = this.s.y;
        container.planets.addChild(visual);

        // Rope
        const rope = {
            one: this,
            two: subject,
            visual: visual,

            type: "normal", // Rope type
            responsible: this, // The planet the rope sprite is positioned from/by
            id: game.ropeID
        }

        // Add to lists
        this.ropes.push({ to: subject, ...rope });
        subject.ropes.push({ to: this, ...rope });

        // All ropes
        game.ropes[rope.id] = rope;

        // this.updateRopeVisual(this.ropes[this.ropes.length-1]);
        game.ropeID++;
    }

    /** Detaches rope */
    detach(subject) {
        if(this.roped === undefined) return;
        this.ropeVisual.parent.removeChild(this.ropeVisual);
        this.ropeVisual = undefined;
        this.roped = undefined;
    }

    /** Accelerate towards another object
     * @param {Planet} influencer Planet exerting influence
     * @param {Number} multiplier Multiplier
     * @param {Function} pullFunc Function used to determine amount of force exerted
     * @returns 
     */
    accelerate(influencer, multiplier=1, pullFunc=standardPullFunc) {
        if(multiplier === 0) return;

        // Accelerate
        const [distance, distX, distY] = hypotCenter(influencer.s, this.s);

        // Return if no distance
        if(distance === 0) return;

        const share = {
            x: percentage(distX, distance)/100,
            y: percentage(distY, distance)/100,
        }

        const pull = pullFunc(influencer, distance);
        this.motion.x += pull*multiplier*share.x;
        this.motion.y += pull*multiplier*share.y;
    }

    /** Removes the pin visualization */
    removePinVisual() {
        if(this.pinVisual === undefined) return;
        this.pinVisual.parent.removeChild(this.pinVisual);
        this.pinVisual = undefined;
    }

    /** Despawn */
    despawn() {
        this.s.parent.removeChild(this.s);
        delete game.entities[this.id];
        this.removePinVisual();
        this.detach();
    }
}
