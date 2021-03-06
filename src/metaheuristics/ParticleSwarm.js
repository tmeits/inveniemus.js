﻿/** # Particle swarm

[Particle Swarm](http://en.wikipedia.org/wiki/Particle_swarm_optimization) is an stochastic
optimization technique. Every candidate solution is treated as a particle with a position and a
velocity. On each iteration the positions and velocities of every particle are updated considering
the best positions so far.
*/
var ParticleSwarm = metaheuristics.ParticleSwarm = declare(Metaheuristic, {
	/** The constructor takes some specific parameters for this search:
	*/
	constructor: function ParticleSwarm(params) {
		Metaheuristic.call(this, params);
		initialize(this, params)
		/** + `inertia=1` is the weight of the particle's current velocity in the velocity update.
		*/
			.number('inertia', { defaultValue: 1, coerce: true })
		/** + `localAcceleration=0.5` is the weight of the particle's current best position in the
				velocity update.
		*/
			.number('localAcceleration', { defaultValue: 0.5, coerce: true })
		/** + `globalAcceleration=0.3` is the weight of the whole swarm's current best position in
				the velocity update.
		*/
			.number('globalAcceleration', { defaultValue: 0.3, coerce: true });
	},

	/** The elements in a particle swarm have two added properties which have to be initialized:

	+ `__velocity__` is the vector that defines the movement of the particle. Initially it is a
		random vector.
	+ `__localBest__` is the best position of the particle in the run. The first position has
		itself as the best so far.
	*/
	initiate: function initiate(size) {
		Metaheuristic.prototype.initiate.call(this, size);
		var mh = this,
			result = this.state.forEach(function (element) {
				var model = element.model;
				element.__velocity__ = mh.random.randoms(model.length, -1, +1).map(function (v, i) {
					return v * model[i].n;
				});
				element.__localBest__ = element;
			});
		this.onInitiate();
		return result;
	},

	/** The method `nextVelocity` calculates the velocity of the particle for the next iteration.
	*/
	nextVelocity: function nextVelocity(element, globalBest) {
		var mh = this,
			velocity = element.__velocity__,
			localBest = element.__localBest__,
			localCoef = this.random.random(this.localAcceleration),
			globalCoef = this.random.random(this.globalAcceleration),
			result = element.values().map(function (v, i) {
				return velocity[i] * mh.inertia +
					localCoef * (localBest.__values__[i] - v) +
					globalCoef * (globalBest.__values__[i] - v);
			});
		return result;
	},

	/** The method `nextElement` creates a new element which represents the position of a particle
	in the next iteration.
	*/
	nextElement: function nextElement(element, globalBest) {
		var mh = this,
			model = element.model,
			nextVelocity = this.nextVelocity(element, globalBest),
			nextValues = element.values().map(function (v, i) {
				return clamp(v + nextVelocity[i], 0, model[i].n - 1);
			}),
			result = new this.problem.Element(nextValues);
		return Future.then(result.evaluate(), function () {
			result.__velocity__ = nextVelocity;
			result.__localBest__ = result.isBetterThan(element.__localBest__) ? result : element.__localBest__;
			return result;
		});
	},

	/** Updating the optimization state means updating each particle velocity and recalculating
	their positions. The best position of the whole run is stored in the `__globalBest__` property,
	and updated every time a new best position is achieved. If nothing fails, in the end the
	particles should converge at this position.
	*/
	update: function update() {
		var mh = this,
			globalBest = this.__globalBest__;
		if (!globalBest) {
			globalBest = this.__globalBest__ = this.state[0];
		}
		return Future.all(this.state.map(function (element) {
			return mh.nextElement(element, globalBest);
		})).then(function (elements) {
			elements = mh.sort(elements);
			mh.state = elements;
			if (mh.problem.compare(mh.__globalBest__, elements[0]) < 0) {
				mh.__globalBest__ = elements[0];
			}
			mh.onUpdate();
			return mh;
		});
	},

	// ## Utilities ################################################################################

	/** Serialization and materialization using Sermat.
	*/
	'static __SERMAT__': {
		identifier: 'ParticleSwarm',
		serializer: function serialize_ParticleSwarm(obj) {
			return [obj.__params__('inertia', 'localAcceleration', 'globalAcceleration')];
		}
	}
}); // declare ParticleSwarm.
