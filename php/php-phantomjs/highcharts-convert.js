var page = require('webpage').create(),
	fs = require('fs'),
	system = require('system'),
	args;

page.onConsoleMessage = function (msg) {
	console.log(msg);
};

page.onAlert = function (msg) {
	console.log(msg);
};

var pick = function () {
	var args = arguments,
		i,
		arg,
		length = args.length;
	for (i = 0; i < length; i += 1) {
		arg = args[i];
		if (typeof arg !== 'undefined' && arg !== null && arg !== 'null') {
			return arg;
		}
	}
};

function mapArguments() {
	var map = {};
	for (var i = 0; i < system.args.length; i += 1) {
		if(system.args[i].charAt(0) === '-') {
			map[system.args[i].substr(1,i.length)] = system.args[i+1];
		}
	}
	return map;
} ;

function scaleAndClipPage(svg) {
	// scale and clip the page
	var zoom = 2,
	pageWidth = pick(svg.sourceWidth, args.width, svg.width);

	if (parseInt(pageWidth) == pageWidth) {
		zoom = pageWidth / svg.width;
	}

	// setting the scale factor has a higher precedence	
	page.zoomFactor = args.scale ? zoom * args.scale: zoom;

	// define the clip-rectangle
	page.clipRect = { top: 0,
				left: 0,
				width: svg.width * page.zoomFactor,
				height: svg.height * page.zoomFactor };
}

// get the arguments and map them
args = mapArguments();

if (args.length < 1 ) {
	console.log('Usage: highcharts-convert.js -infile URL -outfile filename -scale 2.5 -width 300 -constr Chart -callback callback.js');
	phantom.exit(1);
} else {
	var input = args.infile, 
	output = pick(args.outfile,"chart.png"), 
	constr = pick(args.constr, 'Chart'),
	callback = args.callback, 
	callbackStr, optionsStr, 
	width = args.width, 
	outputExtension, pdfOutput;

	outputExtension = output.split('.').pop();
	pdfOutput = outputExtension === 'pdf' ? true : false;

	// open the page. Decide to generate the page from javascript or to load the svg file.
	if (input.split('.').pop() === 'json') {
		// load necessary libraries
		page.injectJs('jquery-1.7.1.min.js');
		page.injectJs('highstock.src.js');
		page.injectJs('highcharts-more.js');

		// load options from file
		if (input !== undefined) {
			optionsStr = fs.read(input);
		} else {
			console.log('No options file specified!');
			phantom.exit();
		}

		// load callback from file
		if (callback !== undefined) {
			callbackStr = fs.read(callback);
		}

		// load chart in page and return svg height and width
		var svg = page.evaluate(function(width, constr, optionsStr, callbackStr, pdfOutput) {

			// dynamic script insertion
			function loadScript(varStr, codeStr){
				var $script = $('<script>').attr('type','text/javascript');
				$script.html('var ' + varStr + ' = ' + codeStr);
				document.getElementsByTagName("head")[0].appendChild($script[0]);
			}

			if (optionsStr != 'undefined') {
				loadScript('options', optionsStr);
			}

			if (callbackStr != 'undefined') {
				loadScript('callback', callbackStr);
			}

			$(document.body).css('margin','0px');
			$container = $('<div>').appendTo(document.body);
			$container.attr('id', 'container');

			//disable animations
			Highcharts.SVGRenderer.prototype.Element.prototype.animate = Highcharts.SVGRenderer.prototype.Element.prototype.attr;

			options.chart.renderTo = $container[0];

			// check if witdh is set. Order of precedence: args.width, options.chart.width and 600px
			options.chart.width = width ? width : options.chart.width ?  options.chart.width : 600;

			var chart = new Highcharts[constr](options,callback);
			
			if (pdfOutput) {
				/* remove stroke-opacity paths, Qt shows them as fully
				 * opaque in the PDF */
				var nodes = document.querySelectorAll('*[stroke-opacity]');

				for (var i = 0; i < nodes.length; i += 1) {
					var elem = nodes[i],
					opacity = elem.getAttribute('stroke-opacity');
					elem.removeAttribute('stroke-opacity');
					elem.setAttribute('opacity',opacity);
				}
			}
			
			return {html: $container[0].firstChild.innerHTML, width: chart.chartWidth,
				height: chart.chartHeight,
				sourceWidth: options.exporting && options.exporting.sourceWidth};

		}, width, constr, optionsStr, callbackStr, pdfOutput);

		try {
			// save the SVG to output or convert to other formats
			if (outputExtension === 'svg') {
				f = fs.open(output, "w");
				f.write(svg.html);
				f.close();
				phantom.exit();
			} else {				
				if (svg.html.indexOf('href') > -1) {
					// set in namespace for images, xlink
					sanitizedSvg = svg.html
						.replace(/<svg /, '<svg xmlns:xlink="http://www.w3.org/1999/xlink" ')
						.replace(/ href=/g, ' xlink:href=');
					//save a temp file with the svg content
					var svgFile = output.slice(0,-3) + 'svg'; 
					f = fs.open(svgFile, "w");
					f.write(sanitizedSvg);
					f.close();
					page.open(svgFile, function (status) {
						if (status !== 'success') {
							console.log('Unable to load the svg tmp file from address!');
							phantom.exit();
						} else {
							
								scaleAndClipPage(svg);
								page.render(output);
								//fs.remove(svgFile);
							window.setTimeout(function(){	
								phantom.exit();
							},1000);
						}
					});					
				} else {
					ddd.ttt;
					scaleAndClipPage(svg);
					page.render(output);					
					phantom.exit();
				}
			}
	    } catch (e) {
	       		console.log(e);
	       		phantom.exit();
		}
	} else {
		/* render page directly from svg file */
		page.open(input, function (status) {

			if (status !== 'success') {
				console.log('Unable to load the address!');
				phantom.exit();
			} else {
				var svg = page.evaluate( function(pdfOutput) {
					if (pdfOutput) {
						/* remove stroke-opacity paths, Qt shows them as fully
						* opaque in the PDF, replace attributes with opacity */
						var nodes = document.querySelectorAll('*[stroke-opacity]');

						for (var i = 0; i < nodes.length; i += 1) {
							var elem = nodes[i],
							opacity = elem.getAttribute('stroke-opacity');
							elem.removeAttribute('stroke-opacity');
							elem.setAttribute('opacity',opacity);
						}
					}

					svgElem = document.getElementsByTagName('svg')[0];
					return { width: svgElem.getAttribute("width"), height: svgElem.getAttribute("height") };
				}, pdfOutput);

				scaleAndClipPage(svg);
				page.render(output);
				phantom.exit();
			}
		});
	}
}