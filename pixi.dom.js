 /**
  * PIXI.DOM v.0.1.0
  *
  * PIXI.DOM is a pixi.js plugin, created to allow you to render DOM elements on top of your pixi stage.
  * In later versions, this plugin might get a few sub plugins to actually let you render DOM elements on canvas.
  *
  * How to use:
  *
  * 1. just include this file after your pixi.js
  *
  * ```<script src="pixi.js"></script>
  * <script src="pixi.dom.js"></script>```
  *
  * 2. set up the plugin (make sure to call PIXI.DOM.Setup after you have attached the view to your page)
  *
  * ```var stage = new PIXI.Stage(...);
  * var renderer = PIXI.autoDetectrenderer(...);
  * document.body.appendChild(renderer.view);
  * PIXI.DOM.Setup( renderer, true );```
  *
  * 3. create elements
  *
  * ```var input = new PIXI.DOM.Sprite( '<input type="text" placeholder="enter message" />', { x: 10, y: 10 } );
  * stage.addChild(input);```
  *
  * ```var iframe = new PIXI.DOM.Sprite( '<iframe>', { src: "http://www.pixijs.com" } );
  * iframe.position.x = 100;
  * iframe.position.y = 100;
  * stage.addChild(iframe);```
  *
  * ```var textarea = new PIXI.DOM.Sprite( document.getElementById('#mytextarea') );
  * stage.addChild( textarea );```
  *
  * 4. destroying elements
  *
  * ```input.destroy(); input = null;```
  * ```iframe.destroy(); iframe = null;```
  * ```textarea.destroy(); textarea = null;```
  */

 (function(PIXI, undefined) {

	var DOM = {};

	var _domContainer = null;
	var _renderer = null;
	var _debugMode = null;

	var _dummyElement = document.createElement('span');
	var _hasComputedStyle = !!window.getComputedStyle;
	var _hasCurrentStyle = !!document.documentElement.currentStyle;
	var _hasBoundingClientRect = !!_dummyElement.getBoundingClientRect;

	var _domElements = [];
	var _domElementsCount = 0;

	// css setup
	var _onScreenCSS = ';position:absolute !important;left:0px;top:0px;';
	var _hideCSS = ';display:none !important;';
	var _clipCSS = ';overflow:hidden; position:relative;';

	// css prefixer
	var getPrefixedCSS = (function() {
		var prefixCache = {};
		var prefixCacheCapitalized = {};
		var cssPrefixes = ["Webkit", "O", "Moz", "ms"];
		var style = (_hasComputedStyle && _dummyElement.ownerDocument.defaultView.getComputedStyle(_dummyElement, null)) || _dummyElement.currentStyle;
		return function (name, capitalize) {
			if(!_hasComputedStyle && !_hasCurrentStyle) {
				return name;
			}
			if(prefixCache[name] === undefined) {
				var bits = name.split('-');
				var capName = bits[0];
				for(var i = 1; i < bits.length; i++) {
					capName += bits[i].charAt(0).toUpperCase() + bits[i].slice(1);
				}
				prefixCache[name] = name + '';
				prefixCacheCapitalized[name] = capName + '';
				if (!(name in style)) {
					capName = capName.charAt(0).toUpperCase() + capName.slice(1);
					for(var i = 0; i < cssPrefixes.length; i++) {
						if ((cssPrefixes[i] + capName) in style) {
							prefixCache[name] = '-' + cssPrefixes[i].toLowerCase() + '-' + name;
							prefixCacheCapitalized[name] = cssPrefixes[i] + capName;
							break;
						}
					}
				}
			}
			return capitalize ? prefixCacheCapitalized[name] : prefixCache[name];
		};
	})();

	// transforms
	var cssTransform = getPrefixedCSS('transform', true);
	var cssTransformOrigin = getPrefixedCSS('transform-origin', true);
	var cssBoxSizing = getPrefixedCSS('box-sizing', true);

	// fake Texture
	var generateFakeTexture = function(w, h) {
		return {
			baseTexture: { hasLoaded: true },
			frame: { width: w, height: h }
		};
	};

	// generate a wireframe debug texture
	var generateDebugTexture = function(w, h) {

		var can = document.createElement('canvas');
		var ctx = can.getContext('2d');

		// texture dimension
		can.width = w;
		can.height = h;

		// backgrounf
		ctx.fillStyle = '#fff';
		ctx.fillRect(0,0,w,h);
		ctx.translate(0.5,0.5);

		// wireframe
		ctx.beginPath();
		ctx.lineWidth = 1;
		ctx.strokeStyle = '#f00';
		ctx.moveTo(0,h-1);
		ctx.lineTo(0,0);
		ctx.lineTo(w-1,0);
		ctx.lineTo(w-1,h-1);
		ctx.lineTo(0,h-1);
		ctx.lineTo(w-1,0);
		ctx.stroke();
		ctx.closePath();

		// create texture		
		return PIXI.Texture.fromCanvas(can);
	};

	/* fetch dom elements */
	var getDomElement = function( tag ) {

		// assume all non strings are dom elements
		if( typeof tag !== 'string' ) {
			return tag;
		}
		
		// jquery like id selector
		if( tag.charAt(0) === '#' ) {
			return document.getElementById( tag.slice(1) );
		}

		// <tagname> selector
		if ( tag.charAt(0) === '<' && tag.charAt( tag.length - 1 ) === '>' && tag.length >= 3 ) {
			_dummyElement.innerHTML = tag;
			return _dummyElement.firstChild;
		}

		// everything else
		return document.createElement( tag );
	};

	/* pixi.js doesn't render / touch children of hidden sprites at all, so we have to go all the way up to find out if we are invisible or not */
	var invisbilityCheck = function(displayObject) {
		return !displayObject.visible || displayObject.alpha <= 0 || (displayObject.stage !== displayObject && (!displayObject.parent || invisbilityCheck(displayObject.parent)));
	};

	//
	DOM.Setup = function( renderer, isDomContainer, debugMode ) {
		_renderer = renderer;
		_debugMode = !!debugMode;
		if( (isDomContainer === undefined || isDomContainer) && renderer.view.parentNode ) {

			// create clipping container
			var wrapper = document.createElement('div');
				wrapper.style.cssText += _clipCSS;
				wrapper.style.width = renderer.view.width + 'px';
				wrapper.style.height = renderer.view.height + 'px';

			// overwrite pixi renderer.resize
			var oldResize = renderer.resize;
			renderer.resize = function( w, h ) {
				oldResize.call( renderer, w, h );
				wrapper.style.width = renderer.view.width + 'px';
				wrapper.style.height = renderer.view.height + 'px';
			};
			
			// attach view to wrapper
			renderer.view.parentNode.appendChild( wrapper );
			renderer.view.parentNode.removeChild( renderer.view );
			wrapper.appendChild( renderer.view );
			
			this.setDomContainer( wrapper );
		}
	};

	// 
	DOM.setDomContainer = function( container ) {
		_domContainer = container;
	};

	//
	DOM.Sprite = function( tag, opts ) {

		opts = opts || {};

		/* grab dom element */
		this.domElement = getDomElement( tag );

		/* remove from prior parent, ensure we have a domcontainer... and attach element */
		if(this.domElement.parentNode) {
			this.domElement.parentNode.removeChild(this.domElement);
		}
		(_domContainer || document.body || document.documentElement).appendChild(this.domElement);

		/* grab opts */
		for(var name in opts) {
			if( name === 'style' ) {
				this.domElement.style.cssText += ';' + opts.style;
				continue;
			}
			if( name === 'class' || name === 'className' ) {
				this.domElement.className += ' ' + opts[name];
				continue;
			}
			if( name === 'css' || name === 'x' || name === 'y' ) {
				continue;
			}
			this.domElement[name] = opts[name];
		}

		/* apply css */
		this.domElement.style[cssBoxSizing] = 'border-box';
		this.domElement.style[cssTransformOrigin] = '0% 0%';
		if( _debugMode ) this.domElement.style.opacity = 0.8;
		if(opts.css) {
			for(var name in opts.css) {
				this.domElement.style[ getPrefixedCSS(name, true) ] = (typeof opts.css[name] === 'number' ? (opts.css[name] + 'px') : opts.css[name]);
			}
		}

		/* compute style */
		var computed = null, rect = null;
		if(!computed && _hasComputedStyle) {
			computed = this.domElement.ownerDocument.defaultView.getComputedStyle(this.domElement, null);
		}
		if(!computed && _hasCurrentStyle) {
			computed = this.domElement.currentStyle;
		}
		if(!computed && _hasBoundingClientRect) {
			computed = this.domElement.getBoundingClientRect();
			computed.width = computed.right - computed.left;
			computed.height = computed.bottom - computed.top;
			computed.getPropertyValue = function(prop) { return computed[prop] || null; };
		} else if(_hasBoundingClientRect) {
			rect = this.domElement.getBoundingClientRect();
			rect.width = rect.right - rect.left;
			rect.height = rect.bottom - rect.top;
		}

		/* sprite dimensions */
		var width	= parseInt((computed && (computed.getPropertyValue('width') || computed.width)) || (opts.css && opts.css.width) || opts.width || 100) || 100;
		var height	= parseInt((computed && (computed.getPropertyValue('height') || computed.height)) || (opts.css && opts.css.height) || opts.height || 30) || 30;

		// dirty fix for width and height in IE (should work on other browsers too)
		if(rect) {
			if(width < rect.width) width = rect.width;
			if(height < rect.height) height = rect.height;
		}

		/* internal vars to check necessary transform updates */
		this._anchor = new PIXI.Point( 0, 0 );
		this._mat = '';

		/* create the sprite */
		PIXI.Sprite.call( this, _debugMode ? generateDebugTexture(width, height) : generateFakeTexture(width, height) );

		/* sprite data */
		this.width		= width;
		this.height		= height;
		this.position.x = opts.x !== undefined ? opts.x : (parseInt((computed && (computed.getPropertyValue('left') || computed.left)) || (opts.css && opts.css.left) || 0) || 0);
		this.position.y = opts.y !== undefined ? opts.y : (parseInt((computed && (computed.getPropertyValue('top') || computed.top)) || (opts.css && opts.css.top) || 0) || 0);

		/* visibility check */
		this.domElement.parentNode.removeChild(this.domElement);
		this.isHidden = true;
		this.oldCssText = '';

		/* add sprite to update loop and set some more css */
		this.domElement.style.cssText += _onScreenCSS;
		this.oldCssText = this.domElement.style.cssText + '';
		this.domElement.style.cssText = _hideCSS;
		_domElements.push(this);
		_domElementsCount++;

		/* attach events */
		if(opts.events) {
			var scope = this;
			for( var name in opts.events ) {
				this.domElement.addEventListener( name, (function( name ) {
					return function() {
						if(!scope.isHidden) {
							opts.events[name]();
						}
					}
				})( name ), false );
			}
		}
	};

	DOM.Sprite.prototype = Object.create( PIXI.Sprite.prototype );
	DOM.Sprite.prototype.constructor = DOM.Sprite;

	/* dom renderer */
	DOM.Sprite.prototype._renderDOM = function() {
		if(this.isHidden) {
			return;
		}

		// update transform origin
		if(this._anchor.x !== this.anchor.x || this._anchor.y !== this.anchor.y) {
			this._anchor.x = this.anchor.x;
			this._anchor.y = this.anchor.y;
			this.domElement.style[cssTransformOrigin] = this.anchor.y * 100 + '% ' + this.anchor.x * 100 + '%';
		}

		// update matrix
		var _mat = 'matrix(' + this.worldTransform.a + ',' + this.worldTransform.b + ',' + this.worldTransform.c + ',' + this.worldTransform.d + ',' + this.worldTransform.tx + ',' + this.worldTransform.ty + ')';
		if(this._mat !== _mat) {
			this._mat = _mat;
			this.domElement.style[cssTransform] = _mat;
		}
	};

	/* canvas rendering */
	DOM.Sprite.prototype._oldRenderCanvas = DOM.Sprite.prototype._renderCanvas;
	DOM.Sprite.prototype._renderCanvas = function(renderSession) {
		if(_debugMode) {
			this._oldRenderCanvas(renderSession);
			return;
		}
		if(!this.visible || this.alpha <= 0) return;
		for(var i = 0, j = this.children.length; i < j; i++) {
            this.children[i]._renderCanvas(renderSession);
        }
	};
	
	/* webgl rendering */
	DOM.Sprite.prototype._oldRenderWebGL = DOM.Sprite.prototype._renderWebGL;
	DOM.Sprite.prototype._renderWebGL = function(renderSession) {
		if(_debugMode) {
			this._oldRenderWebGL(renderSession);
			return;
		}
		if(!this.visible || this.alpha <= 0) return;
		for(var i = 0, j = this.children.length; i < j; i++) {
            this.children[i]._renderWebGL(renderSession);
        }
	};

	/* removes the element from dom and destroys the texture */
	DOM.Sprite.prototype.destroy = function( destroyTexture ) {

		// remove dom element from visibility check
		var index = _domElements.indexOf( this );
		if(index !== -1) {
			_domElements.splice( index, 1 );
			_domElementsCount--;
		}

		// remove dom element from parent node
		if(this.domElement.parentNode) {
			this.domElement.parentNode.removeChild( this.domElement );
		}

		// remove sprite from parent object
		if(this.parent) {
			this.parent.removeChild( this );
		}

		// destroy texture
		if(this.texture.destroy) {
			this.texture.destroy( !!destroyTexture );
		}
	};

	/* the magic comes here */
	var update = function() {
		if(!_domContainer) DOM.setDomContainer(document.body);
		for(var i = 0; i < _domElementsCount; i++) {
			var sprite = _domElements[i];
			var dom = sprite.domElement;
			if(!sprite.parent) {
				if(dom.parentNode) {
					dom.parentNode.removeChild(dom);
				}
				continue;
			}
			if(sprite.parent && !dom.parentNode) {
				_domContainer.appendChild(dom);
			}
			if(invisbilityCheck(sprite)) {
				if(!sprite.isHidden) {
					sprite.oldCssText = dom.style.cssText + '';
					dom.style.cssText = _hideCSS;
					sprite.isHidden = true;
				}
			} else {
				if(sprite.isHidden) {
					dom.style.cssText = sprite.oldCssText;
					sprite.isHidden = false;
				}
				sprite._renderDOM();
			}
		}
	};

	/**
	 * due to the nature of pixi not touching the children sprites of any container, if said container is not visible,
	 * we have to hijack any function that is called during the rendering process.
	 * any opinions?
	 * alternative: always add an interaction?
	 */
	PIXI.WebGLRenderer.prototype.oldRender = PIXI.WebGLRenderer.prototype.render;
	PIXI.WebGLRenderer.prototype.render = function(stage) {
		this.oldRender(stage);
		update();
	};
	PIXI.CanvasRenderer.prototype.oldRender = PIXI.CanvasRenderer.prototype.render;
	PIXI.CanvasRenderer.prototype.render = function(stage) {
		this.oldRender(stage);
		update();
	};

	// namespace
	PIXI.DOM = DOM;
	PIXI.DOMSprite = DOM.Sprite;

 })(PIXI);