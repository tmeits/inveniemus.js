﻿/**	# Metaheuristic

A [Metaheuristic](http://en.wikipedia.org/wiki/Metaheuristic) is an optimization algorithm (which
can also be used for searching). This is the base class of all metaheuristic algorithms, and hence
of all metaheuristic runs.
*/
var Metaheuristic = exports.Metaheuristic = declare({
	/** Each metaheuristic has its own `logger`, to track its process.
	*/
	logger: new Logger('inveniemus', Logger.ROOT, 'INFO'),

	/** The constructor takes a `params` object with the metaheuristic parameters. Although the
	different algorithms have particular parameters of their own, some apply to all.
	*/
	constructor: function Metaheuristic(params) {
		initialize(this, params)
		/** First, the definition of the `problem` this metaheuristic is meant to solve.
		*/
			.object('problem', { defaultValue: null })
		/** The optimization's `size` is the amount of candidate solutions the metaheuristic treats
		at each step. By default it is 100.
		*/
			.number('size', { defaultValue: 100, coerce: true })
		/** The `state` is the array that holds the elements this metaheuristic handles at each step.
		*/
			.array('state', { defaultValue: [] })
		/** All optimizations perform a certain number of iterations or `steps` (100 by default).
		*/
			.number('steps', { defaultValue: 100, coerce: true })
		/** The property `step` indicates the current iteration of this optimization, or a negative
		number if it has not started yet.
		*/
			.integer('step', { defaultValue: -1, coerce: true })
		/** Most metaheuristic are stochastic processes, hence the need for a pseudo-random number
		generator. By default `base.Randomness.DEFAULT` is used, yet it is strongly advised to
		provide one.
		*/
			.object('random', { defaultValue: Randomness.DEFAULT })
		/** Metaheuristic's runs usually gather `statistics` about the process.
		*/
			.object('statistics', { defaultValue: new Statistics() })
			.object('logger', { ignore: true });
		this.events = new Events({
			events: ["initiated", "updated", "expanded", "evaluated", "sieved", "advanced", "analyzed", "finished"]
		});
	},

	__log__: function __log__(level) {
		if (this.logger) {
			this.logger[level].apply(this.logger, arguments);
		}
	},

	// ## Basic workflow ###########################################################################

	/**	`initiate(size=this.size)` builds and initiates this metaheuristic state with size new
	cursors. The elements are build using the `initial()` function.
	*/
	initiate: function initiate(size) {
		size = isNaN(size) ? this.size : +size || 0;
		this.state = new Array(size);
		for (var i = 0; i < size; i++) {
			this.state[i] = new this.problem.Element(); // Element with random values.
		}
		this.onInitiate();
	},

	/** `update()` updates this metaheuristic's state. It assumes the state has been initialized.
	The process may be asynchronous, so it returns a future. The default implementation first
	expands the state by calling `expand()`, then evaluates the added elements by calling
	`evaluate()`, and finally removes the worst elements with `sieve()`.
	*/
	update: function update() {
		var mh = this;
		this.expand();
		return Future.then(this.evaluate(), function () {
			mh.sieve();
			mh.onUpdate();
			return mh;
		});
	},

	/** `expand(expansion=[])` adds to this metaheuristic's state the given expansion. If none is
	given, `expansion()` is called to get new expansion.
	*/
	expand: function expand(expansion) {
		expansion = expansion || this.expansion();
		if (expansion.length < 1) {
			this.__log__('warn', "Expansion is empty");
		} else {
			this.state = this.state.concat(expansion);
		}
		this.onExpand();
	},

	/** `expansion(size)` returns an array of new elements to add to the current state. The default
	implementation generates new random elements.
	*/
	expansion: function expansion(size) {
		var expansionRate = isNaN(this.expansionRate) ? 1 : +this.expansionRate;
		size = isNaN(size) ? Math.floor(expansionRate * this.size) : +size;
		var elems = new Array(size), i;
		for (i = 0; i < size; i++){
			elems[i] = new this.problem.Element();
		}
		return elems;
	},

	/** `evaluate(elements)` evaluates all the elements in `state` with no evaluation, using its
	evaluation method. After that sorts the state with the `compare` method of the problem. May
	return a future, if any evaluation is asynchronous.
	*/
	evaluate: function evaluate(elements) {
		var mh = this,
			evalTime = this.statistics && this.statistics.stat({key:'evaluation_time'});
		if (evalTime) evalTime.startTime();
		elements = elements || this.state;
		return Future.then(this.problem.evaluate(elements), function (results) {
			elements = mh.sort(elements);
			if (evalTime) evalTime.addTime();
			mh.onEvaluate(results);
			return elements;
		});
	},

	/** `sort(elements)` TODO
	*/
	sort: function sort(elements) {
		elements = elements || this.state;
		if (this.problem.objectives.length > 1) { // Multi-objective optimization.
			elements = this.multiObjectiveSort(elements);
		} else { // Single-objective optimization.
			elements.sort(this.problem.compare.bind(this.problem));
			elements.reverse();
		}
		return elements;
	},

	/** `sieve(size=this.size)` cuts the current state down to the given size (or this.size by
	default). This is usually used after expanding and evaluating the state.
	*/
	sieve: function sieve(size) {
		size = isNaN(size) ? this.size : Math.floor(size);
		if (this.state.length > size) {
			this.state = this.state.slice(0, this.size);
		}
		this.onSieve();
	},

	/** `finished()` termination criteria for this metaheuristic. By default it checks if the number
	of passed iterations is not greater than `steps`.
	*/
	finished: function finished() {
		return this.step >= this.steps || this.problem.sufficientElements(this.state);
	},

	/** `analyze()` updates the process' statistics.
	*/
	analyze: function analyze(statistics) {
		statistics = statistics || this.statistics;
		var step = this.step;
		if (statistics) {
			if (this.state[0].evaluation.length === 1) { // Single-objective optimization.
				var stat_evaluation = statistics.stat({ key:'evaluation', step: step });
				this.state.forEach(function (element) {
					if (element.evaluation) {
						stat_evaluation.add(element.evaluation[0], element);
					}
				});
			} else { // Multi-objective optimization.
				var stats_evaluation = this.state[0].evaluation.map(function (_, i) {
						return statistics.stat({ key:'evaluation', index: i, step: step });
					}),
					stat_dominators = statistics.stat({ key:'dominators', step: step }),
					stat_dominated = statistics.stat({ key:'dominated', step: step });
				this.state.forEach(function (element) {
					element.evaluation.forEach(function (v, i) {
						stats_evaluation[i].add(v, element);
					});
					stat_dominators.add(element.pareto.dominators.length, element);
					stat_dominated.add(element.pareto.dominated.length, element);
				});
			}
			this.onAnalyze();
		}
		return statistics;
	},

	/** `advance()` performs one step of the optimization. If the process has not been initialized,
	it does so. Returns a future if any step is asynchronous.
	*/
	advance: function advance() {
		var mh = this,
			stepTime = this.statistics && this.statistics.stat({key: 'step_time'}),
			result;
		if (isNaN(this.step) || +this.step < 0) {
			this.reset();
			if (stepTime) stepTime.startTime();
			this.initiate();
			result = this.evaluate();
		} else {
			if (stepTime) stepTime.startTime();
			result = this.update();
		}
		return Future.then(result, function () {
			mh.step = isNaN(mh.step) || +mh.step < 0 ? 0 : +mh.step + 1;
			mh.analyze(); // Calculate the state's stats after updating it.
			if (stepTime) stepTime.addTime();
			mh.onAdvance();
			return mh;
		});
	},

	/** `run()` returns a future that is resolved when the whole search process is finished. The
	value is the best cursor after the last step. It always returns a future.
	*/
	run: function run() {
		var mh = this,
			advance = this.advance.bind(this),
			continues = function continues() {
				return !mh.finished();
			};
		return Future.doWhile(advance, continues).then(function () {
			mh.onFinish();
			return mh.state[0]; // Return the best cursor.
		});
	},

	/** `reset()` reset the process to start over again. Basically cleans the statistics and sets
	the current `step` to -1.
	*/
	reset: function reset() {
		this.step = -1;
		if (this.statistics) this.statistics.reset();
	},

	// ## State control ############################################################################

	/** The `nub` method eliminates repeated elements inside the state. Use responsibly, since this
	is an expensive operation. Returns the size of the resulting state.
	*/
	nub: function nub(precision) {
		precision = +precision || 0;
		this.state = iterable(this.state).nub(function (e1, e2) {
			var values1 = e1.__values__,
				values2 = e2.__values__,
				len = values1.length;
			if (len !== values2.length) {
				return false;
			} else for (var i = 0; i < len; ++i) {
				if (Math.abs(values1[i] - values2[i]) > precision) {
					return false;
				}
			}
			return true;
		}).toArray();
		return this.state.length;
	},

	// ## Events ###################################################################################

	/** For better customization the `events` handler emits the following events:

	+ `initiated` when the state has been initialized.
	*/
	onInitiate: function onInitiate() {
		this.events.emit('initiated', this);
		this.__log__('debug', 'State has been initiated. Nos coepimus.');
	},

	/** + `updated` when the state has been expanded, evaluated and sieved.
	*/
	onUpdate: function onUpdate() {
		this.events.emit('updated', this);
		this.__log__('debug', 'State has been updated. Mutatis mutandis.');
	},

	/** + `expanded` after new elements are added to the state.
	*/
	onExpand: function onExpand() {
		this.events.emit('expanded', this);
		this.__log__('debug', 'State has been expanded. Nos exploramus.');
	},

	/** + `evaluated` after the elements in the state are evaluated.
	*/
	onEvaluate: function onEvaluate(elements) {
		this.events.emit('evaluated', this, elements);
		this.__log__('debug', 'Evaluated and sorted ', elements.length, ' elements. Appretiatus sunt.');
	},

	/** + `sieved` after elements are removed from the state.
	*/
	onSieve: function onSieve() {
		this.events.emit('sieved', this);
		this.__log__('debug', 'State has been sieved. Haec est viam.');
	},

	/** + `advanced` when one full iteration is completed.
	*/
	onAdvance: function onAdvance() {
		this.events.emit('advanced', this);
		this.__log__('debug', 'Step ', this.step, ' has been completed. Nos proficimus.');
	},

	/** + `analyzed` after the statistics are calculated.
	*/
	onAnalyze: function onAnalyze() {
		this.events.emit('analyzed', this);
		this.__log__('debug', 'Statistics have been gathered. Haec sunt numeri.');
	},

	/** + `finished` when the run finishes.
	*/
	onFinish: function onFinish() {
		this.events.emit('finished', this);
		this.__log__('debug', 'Finished. Nos invenerunt!');
	},

	// ## Multi-objective ##########################################################################

	/** A Pareto analysis of a set of elements compares all elements with each other, accounting the
	domination relationship between the elements. Every element gets a new property `pareto`, an
	object holding two arrays:

	+ `pareto.dominated` is a list of elements dominated by this element,

	+ `pareto.dominators` is a list of elements that dominate this element.
	*/
	paretoAnalysis: function paretoAnalysis(elements) {
		elements = elements || this.state;
		var len = elements.length,
			i1, i2, elem1, elem2, domination;
		for (i1 = 0; i1 < len; i1++) {
			elements[i1].pareto = { dominated: [], dominators: [] };
		}
		for (i1 = 0; i1 < len; i1++) {
			elem1 = elements[i1];
			for (i2 = i1 + 1; i2 < len; i2++) {
				elem2 = elements[i2];
				domination = this.problem.compare(elem1, elem2).domination;
				if (domination > 0) {
					elem1.pareto.dominated.push(elem2);
					elem2.pareto.dominators.push(elem1);
				} else if (domination < 0) {
					elem2.pareto.dominated.push(elem1);
					elem1.pareto.dominators.push(elem2);
				}
			}
		}
		return elements;
	},

	/** Sorting function used for multiobjective problems. By default uses `nonDominatedSort` (based
	on NSGA).
	*/
	multiObjectiveSort: function multiObjectiveSort(elements) {
		return this.nonDominatedSort(elements);
	},

	/** The crowding distance is an estimation of the density of elements surrounding each element
	in the given list (or the state by default). Every element will be added a `crowdingDistance`
	number property.
	*/
	crowdingDistance: function crowdingDistance(elements) {
		elements = elements || this.state;
		var es = elements.slice(), // shallow copy.
			count = this.problem.objectives.length,
			i, j;
		for (i = 0; i < es.length; i++) {
			es[i].crowdingDistance = 0;
		}
		for (i = 0; i < count; i++) {
			es.sort(function (elem1, elem2) {
				return elem1.evaluation[i] - elem2.evaluation[i];
			});
			es[0].crowdingDistance = Infinity;
			es[es.length - 1].crowdingDistance = Infinity;
			for (j = 1; j < es.length - 1; j++) {
				es[j].crowdingDistance += es[j + 1].evaluation[i] - es[j - 1].evaluation[i];
			}
		}
		return elements;
	},

	/** The non-dominated sort is based on [_"A Fast Elitist Non-Dominated Sorting Genetic Algorithm
	for Multi-Objective Optimization: NSGA-II"_ by Deb (2000)](http://citeseer.ist.psu.edu/viewdoc/summary?doi=10.1.1.18.4257).
	*/
	nonDominatedSort: function nonDominatedSort(elements) {
		elements = this.paretoAnalysis(elements);
		elements = this.crowdingDistance(elements);
		elements.sort(function (elem1, elem2) {
			return (elem1.pareto.dominators.length - elem2.pareto.dominators.length) ||
				(elem2.crowdingDistance - elem1.crowdingDistance);
		});
		return elements;
	},

	/** The Pareto strength of an element is defined as the sum of the amount of elements being
	dominated by all dominators of a given element. For more information see: [_"SPEA2: Improving
	the Strength Pareto Evolutionary Algorithm"_ by Zitzler et al (2001)](http://citeseer.ist.psu.edu/viewdoc/summary?doi=10.1.1.112.5073).
	*/
	strengthParetoSort: function strengthParetoSort(elements) {
		elements = this.paretoAnalysis(elements);
		iterable(elements).forEach(function (elem) {
			elem.pareto.strength = iterable(elem.pareto.dominators).map(function (dominator) {
				return dominator.pareto.dominated.length;
			}).sum();
		});
		return elements.sort(function (elem1, elem2) { // Pareto strength must be minimized.
			return elem1.pareto.strength - elem2.pareto.strength;
		});
	},

	// ## Utilities ################################################################################

	/** The default string representation of a Metaheuristic is like `"[object class]"`.
	*/
	toString: function toString() {
		return "[object "+ (this.constructor.name || 'Metaheuristic') +"]";
	},

	/** Returns a reconstruction of the parameters used in the construction of this instance.
	*/
	__params__: function __params__() {
		var params = { problem: this.problem, size: this.size, steps: this.steps };
		if (this.random !== Randomness.DEFAULT) {
			params.random = this.random;
		}
		if (this.step >= 0) {
			params.step = this.step;
			params.state = this.state;
			params.statistics = this.statistics;
		} else if (this.state.length > 0) {
			params.state = this.state;
		}
		for (var i = 0; i < arguments.length; i++) {
			var id = arguments[i];
			if (this.hasOwnProperty(id)) {
				params[id] = this[id];
			}
		}
		return params;
	},

	/** Serialization and materialization using Sermat.
	*/
	'static __SERMAT__': {
		identifier: 'Metaheuristic',
		serializer: function serialize_Metaheuristic(obj) {
			return [obj.__params__()];
		}
	}
}); // declare Metaheuristic.
