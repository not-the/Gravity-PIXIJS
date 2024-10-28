import { app, game, config, container, in_planet_size } from "./main.js"
import { hypot, hypotCenter, angleRelative } from "./util.js"
import Trail from "./Trail.js"

export default class Planet {
    constructor(mass=in_planet_size.value/200, x=500, y=500, color=Math.ceil(Math.random() * 16777215)) {
        // Prep
        const size = mass*200; // Size and mass are the same number for now

        // Sprite
        this.s = new PIXI.Graphics();
        this.s.beginFill(color);

        this.s.drawCircle(size, size, size).endFill();
        this.s.x = x;
        this.s.y = y;
        this.color = color;
        this.s.zIndex = game.entityID;
        this.id = game.entityID;
        
        this.grav_law = 1.01;

        // Game
        this.mass = mass;
        this.motion = { x: 0, y: 0, r: 0 };
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

    get center() {
        return [ this.s.x+this.s.width/2, this.s.y+this.s.height/2 ]
    }
    get speed() {
        return hypot(this.motion, {x:0,y:0})[0];
    }

    drag() {
        this.dragging = true;
        game.dragging = this;
    }
    endDrag() {
        this.dragging = false;
        game.dragging = undefined;
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
        const speed = this.speed;
        let strongerFartherFunc = (influencer, distance) => {
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

        // Ropes
        if(this.roped) {
            let ropePullFunc = (influencer, distance) => {
                let strength = config.stiff_rope ? 0.5 : 0.1;
                distance -= config.rope_length;
                let pull = Math.pow(influencer.grav_law, distance*2) * strength * game.delta;
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
        this.s.x += this.motion.x * game.delta;
        this.s.y += this.motion.y * game.delta;
    }

    ropeTo(subject) {
        this.roped = subject;
        this.ropeVisual = new PIXI.Graphics();
        this.ropeVisual.beginFill(0xffffff).drawRect(0,0, 6, 1).endFill();
        this.ropeVisual.x = this.s.x;
        this.ropeVisual.y = this.s.y;
        container.planets.addChild(this.ropeVisual);

        this.updateRopeVisual();
    }
    detach() {
        if(this.roped === undefined) return;
        this.ropeVisual.parent.removeChild(this.ropeVisual);
        this.ropeVisual = undefined;
        this.roped = undefined;
    }

    /** Accelerate towards another object */
    accelerate(influencer, multiplier=1, pullFunc=(influencer, distance) => Math.pow(influencer.grav_law, distance*-1) * influencer.mass * game.delta) {
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
        delete game.entities[this.id];
        this.removePinVisual();
        this.detach();
    }
}