import { game, container } from "./main.js"

export default class Trail {
    /**
     * 
     * @param {Number} x 
     * @param {Number} y 
     * @param {Number} alpha 
     * @param {Number} size Size (radius)
     * @param {Number} color 
     */
    constructor(x=500, y=500, alpha=0.5, size=2, color=0xffffff) {
        // Sprite
        this.s = new PIXI.Graphics();
        this.s.beginFill(color);

        this.s.drawCircle(size, size, size).endFill();
        this.s.x = x-this.s.width/2;
        this.s.y = y-this.s.height/2;
        this.s.alpha = alpha;
        this.id = game.particleID;
        container.trails.addChild(this.s);

        // let time = elapsed;
        // let expires = elapsed + 10;

        // Add to list
        game.particles[game.particleID] = this;
        game.particleID++;
    }

    tick() {
        const sw = this.s.width;

        this.s.width -= this.s.width * 0.02 * game.delta;
        this.s.height -= this.s.height * 0.02 * game.delta;

        const off = (sw-this.s.width)/2;
        this.s.x += off; this.s.y += off;
        this.s.alpha -= 0.005 * game.delta;

        // Despawn
        if(this.s.alpha <= 0) this.despawn();
    }

    despawn() {
        this.s.parent.removeChild(this.s);
        delete game.particles[this.id];
    }
}