// fix old IE bug with console
if(!window.console){ window.console = {log: function(){} }; }

// Load the Visualization API and the piechart package.
google.load('visualization', '1.1', {'packages':['corechart']});
//google.load('visualization', '1.1', {'packages':['controls']});

function canChartBeRefreshed(chart) {
	// is it enabled?
	if(!chart.enabled) return false;

	// is there something selected on the chart?
	if(chart.chart && chart.chart.getSelection()[0]) return false;

	// is it too soon for a refresh?
	var now = new Date().getTime();
	if((now - chart.last_updated) < (chart.group * chart.update_every * 1000)) return false;

	// is the chart in the visible area?
	//console.log(chart.div);
	if($('#' + chart.div).visible(true) == false) return false;

	// ok, do it
	return true;
}

function generateChartURL(chart) {
	// build the data URL
	var url = chart.url;
	url += chart.points_to_show?chart.points_to_show.toString():"all";
	url += "/";
	url += chart.group?chart.group.toString():"1";
	url += "/";
	url += chart.group_method?chart.group_method:"average";
	url += "/";
	url += chart.after?chart.after.toString():"0";
	url += "/";
	url += chart.before?chart.before.toString():"0";
	url += "/";

	return url;
}

function refreshChart(chart, doNext) {
	if(canChartBeRefreshed(chart) == false) return false;

	$.ajax({
		url: generateChartURL(chart),
		dataType:"json",
		cache: false
	})
	.done(function(jsondata) {
		if(!jsondata || jsondata.length == 0) return;
		chart.jsondata = jsondata;
		
		// Create our data table out of JSON data loaded from server.
		chart.datatable = new google.visualization.DataTable(chart.jsondata);
		
		// cleanup once every 50 updates
		// we don't cleanup on every single, to avoid firefox flashing effect
		if(chart.chart && chart.refreshCount > 50) {
			chart.chart.clearChart();
			chart.chart = null;
			chart.refreshCount = 0;
		}

		// Instantiate and draw our chart, passing in some options.
		if(!chart.chart) {
			console.log('Creating new chart for ' + chart.url);
			if(chart.chartType == "LineChart")
				chart.chart = new google.visualization.LineChart(document.getElementById(chart.div));
			else
				chart.chart = new google.visualization.AreaChart(document.getElementById(chart.div));
		}
		
		if(chart.chart) {
			chart.chart.draw(chart.datatable, chart.chartOptions);
			chart.refreshCount++;
			chart.last_updated = new Date().getTime();
		}
		else console.log('Cannot create chart for ' + chart.url);
	})
	.fail(function() {
		// to avoid an infinite loop, let's assume it was refreshed
		if(chart.chart) chart.chart.clearChart();
		chart.chart = null;
		chart.refreshCount = 0;
		showChartIsLoading(chart.div, chart.name, chart.chartOptions.width, chart.chartOptions.height, "failed to refresh");
		chart.last_updated = new Date().getTime();
	})
	.always(function() {
		if(typeof doNext == "function") doNext();
	});

	return true;
}

function chartIsLoadingHTML(name, width, height, message)
{
	return "<table><tr><td align=\"center\" width=\"" + width + "\" height=\"" + height + "\" style=\"vertical-align:middle\"><h4><span class=\"glyphicon glyphicon-refresh\"></span><br/><br/>loading " + name + "<br/><br/><span class=\"label label-default\">" + (message?message:"Please wait...") + "</span></h4></td></tr></table>";
}

function showChartIsLoading(id, name, width, height, message) {
	document.getElementById(id).innerHTML = chartIsLoadingHTML(name, width, height, message);
}

// calculateChartPointsToShow
// calculate the chart group and point to show properties.
// This uses the chartOptions.width and the supplied divisor
// to calculate the propers values so that the chart will
// be visually correct (not too much or too less points shown).
//
// c = the chart
// divisor = when calculating screen points, divide width with this
//           if all screen points are used the chart will be overcrowded
//           the default is 2
// maxtime = the maxtime to show
//           the default is to render all the server data
// group   = the required grouping on points
//           if undefined or negative, any calculated value will be used
//           if zero, one of 1,2,5,10,15,20,30,45,60 will be used

function calculateChartPointsToShow(c, divisor, maxtime, group) {
	if(!divisor) divisor = 2;

	var before = c.before?c.before:new Date().getTime() / 1000;
	var after = c.after?c.after:c.first_entry_t;

	var dt = before - after;
	if(dt > c.entries * c.update_every) dt = c.entries * c.update_every;

	if(maxtime) dt = maxtime;

	var data_points = Math.round(dt / c.update_every);
	var screen_points = Math.round(c.chartOptions.width / divisor);
	mylog('screen = ' + screen_points + ', data = ' + data_points + ', divisor = ' + divisor);

	if(group == undefined || group <= 0) {
		if(screen_points > data_points) {
			c.group = 1;
			c.points_to_show = data_points;
			//mylog("rendering at full detail");
		}
		else {
			c.group = Math.round(data_points / screen_points);

			if(group != undefined && group >= 0) {
				     if(c.group > 60) c.group = 60;
				else if(c.group > 45) c.group = 45;
				else if(c.group > 30) c.group = 30;
				else if(c.group > 20) c.group = 20;
				else if(c.group > 15) c.group = 15;
				else if(c.group > 10) c.group = 10;
				else if(c.group > 5) c.group = 5;
				else if(c.group > 2) c.group = 2;
				else c.group = 1;
			}

			c.points_to_show = Math.round(data_points / c.group);
			//mylog("rendering adaptive");
		}
	}
	else {
		c.group = group;
		c.points_to_show = Math.round(data_points / group);
		//mylog("rendering with given group");
	}
	mylog('group = ' + c.group + ', points = ' + c.points_to_show);

	// make sure the line width is not congesting the chart
	if(c.chartType == 'LineChart') {
		if(c.points_to_show > c.chartOptions.width / 2) {
			c.chartOptions.lineWidth = 1;
			c.chartOptions.curveType = 'line';
		}

		else if(c.points_to_show > c.chartOptions.width / 3) {
			c.chartOptions.lineWidth = 1;
			c.chartOptions.curveType = 'function';
		}

		else {
			c.chartOptions.lineWidth = 2;
			c.chartOptions.curveType = 'function';
		}
	}
	else if(c.chartType == 'AreaChart') {
		if(c.points_to_show > c.chartOptions.width / 2)
			c.chartOptions.lineWidth = 0;

		else
			c.chartOptions.lineWidth = 1;
	}
}


// loadCharts()
// fetches all the charts from the server
// returns an array of objects, containing all the server metadata
// (not the values of the graphs - just the info about the graphs)

function loadCharts(base_url, doNext) {
	$.ajax({
		url: ((base_url)?base_url:'') + '/all.json',
		dataType: 'json',
		cache: false
	})
	.done(function(json) {
		$.each(json.charts, function(i, value) {
			json.charts[i].div = json.charts[i].name.replace(/\./g,"_");
			json.charts[i].div = json.charts[i].div.replace(/\-/g,"_");
			json.charts[i].div = json.charts[i].div + "_div";

			// make sure we have the proper values
			if(!json.charts[i].update_every) chart.update_every = 1;
			if(base_url) json.charts[i].url = base_url + json.charts[i].url;

			json.charts[i].last_updated = 0;
			json.charts[i].thumbnail = false;
			json.charts[i].refreshCount = 0;
			json.charts[i].group = 1;
			json.charts[i].points_to_show = 0;	// all
			json.charts[i].group_method = "max";

			json.charts[i].chart = null;
			json.charts[i].jsondata = null;
			json.charts[i].datatable = null;
			json.charts[i].before = 0;
			json.charts[i].after = 0;

			// if it is detail, disable it by default
			if(json.charts[i].isdetail) json.charts[i].enabled = false;

			// set default chart options
			json.charts[i].chartOptions = {
				width: 400,
				height: 200,
				lineWidth: 1,
				title: json.charts[i].title,
				// hAxis: {title: "Time of Day", viewWindowMode: 'maximized', format:'HH:mm:ss'},
				hAxis: {viewWindowMode: 'maximized', format:'HH:mm:ss'},
				vAxis: {title: json.charts[i].units, viewWindowMode: 'pretty', minValue: 0, maxValue: 10},
				chartArea : {width: '70%', height: '80%'},
				focusTarget: 'category',
				annotation: {'1': {style: 'line'}},
				//colors: ['blue', 'red', 'green', 'lime', 'olive', 'yellow', 'navy', 'fuchsia', 'maroon', 'aqua', 'teal', 'purple', 'black', 'gray', 'silver'],
				//tooltip: {isHtml: true},
			};

			// set the chart type
			if(json.charts[i].type == "tc"
				|| json.charts[i].id.substring(0, 7) == "cpu.cpu"
				|| json.charts[i].name == 'system.cpu'
				|| json.charts[i].name == 'system.ram'
				|| json.charts[i].name == 'system.swap'
				|| json.charts[i].name == 'mem.slab'
				|| json.charts[i].name == 'mem.kernel'
				|| json.charts[i].name == 'cpu.netdata'
				) {

				// default for all stacked AreaChart
				json.charts[i].chartType = "AreaChart";
				json.charts[i].chartOptions.isStacked = true;
				json.charts[i].chartOptions.areaOpacity = 0.85;
				json.charts[i].chartOptions.lineWidth = 1;
				//json.charts[i].chartOptions.vAxis.viewWindowMode = 'maximized';

				json.charts[i].group_method = "average";
			}
			else if(json.charts[i].type == "net"
				|| json.charts[i].type == "disk"
				|| json.charts[i].id == "system.ipv4"
				|| json.charts[i].id == "system.io"
				|| json.charts[i].id == "system.swapio"
				|| json.charts[i].id == "ipv4.mcast"
				|| json.charts[i].id == "ipv4.bcast"
				|| json.charts[i].id == "mem.committed"
				) {

				// default for all AreaChart
				json.charts[i].chartType = "AreaChart";
				json.charts[i].chartOptions.isStacked = false;
				json.charts[i].chartOptions.areaOpacity = 0.3;
			}
			else {
				
				// default for all LineChart
				json.charts[i].chartType = "LineChart";
				json.charts[i].chartOptions.lineWidth = 2;
				json.charts[i].chartOptions.curveType = 'function';

				json.charts[i].chartOptions.vAxis.minValue = -0.1;
				json.charts[i].chartOptions.vAxis.maxValue =  0.1;
			}

			// the category name, and other options, per type
			switch(json.charts[i].type) {
				case "system":
					json.charts[i].category = "System";
					json.charts[i].glyphicon = "glyphicon-dashboard";
					json.charts[i].group = 5;

					if(json.charts[i].id == "system.cpu" || json.charts[i].id == "system.ram") {
						json.charts[i].chartOptions.vAxis.minValue = 0;
						json.charts[i].chartOptions.vAxis.maxValue = 100;
					}
					else {
						json.charts[i].chartOptions.vAxis.minValue = -0.1;
						json.charts[i].chartOptions.vAxis.maxValue =  0.1;
					}
					break;

				case "cpu":
					json.charts[i].category = "CPU";
					json.charts[i].glyphicon = "glyphicon-dashboard";
					json.charts[i].group = 5;

					if(json.charts[i].id.substring(0, 7) == "cpu.cpu") {
						json.charts[i].chartOptions.vAxis.minValue = 0;
						json.charts[i].chartOptions.vAxis.maxValue = 100;
					}
					break;

				case "mem":
					json.charts[i].category = "Memory";
					json.charts[i].glyphicon = "glyphicon-dashboard";
					json.charts[i].group = 5;
					break;

				case "tc":
					json.charts[i].category = "QoS";
					json.charts[i].glyphicon = "glyphicon-random";
					json.charts[i].group = 15;
					break;

				case "net":
					json.charts[i].category = "Network";
					json.charts[i].glyphicon = "glyphicon-transfer";
					json.charts[i].group = 5;

					// disable IFB and net.lo devices by default
					if((json.charts[i].id.substring(json.charts[i].id.length - 4, json.charts[i].id.length) == "-ifb")
						|| json.charts[i].id == "net.lo")
						json.charts[i].enabled = false;
					break;

				case "ipv4":
					json.charts[i].category = "IPv4";
					json.charts[i].glyphicon = "glyphicon-globe";
					json.charts[i].group = 5;
					break;

				case "conntrack":
					json.charts[i].category = "Netfilter";
					json.charts[i].glyphicon = "glyphicon-cloud";
					json.charts[i].group = 5;
					break;

				case "ipvs":
					json.charts[i].category = "IPVS";
					json.charts[i].glyphicon = "glyphicon-sort";
					json.charts[i].group = 5;
					break;

				case "disk":
					json.charts[i].category = "Disks";
					json.charts[i].glyphicon = "glyphicon-hdd";
					json.charts[i].group = 5;
					break;

				default:
					json.charts[i].category = json.charts[i].type;
					json.charts[i].glyphicon = "glyphicon-search";
					json.charts[i].group = 5;
					break;
			}
		});
		
		if(typeof doNext == "function") doNext(json);
	})
	.fail(function() {
		if(typeof doNext == "function") doNext();
	});
};

// jquery visible plugin
(function($){

	/**
	 * Copyright 2012, Digital Fusion
	 * Licensed under the MIT license.
	 * http://teamdf.com/jquery-plugins/license/
	 *
	 * @author Sam Sehnert
	 * @desc A small plugin that checks whether elements are within
	 *		 the user visible viewport of a web browser.
	 *		 only accounts for vertical position, not horizontal.
	 */
	$.fn.visible = function(partial){
		
	    var $t				= $(this),
	    	$w				= $(window),
	    	viewTop			= $w.scrollTop(),
	    	viewBottom		= viewTop + $w.height(),
	    	_top			= $t.offset().top,
	    	_bottom			= _top + $t.height(),
	    	compareTop		= partial === true ? _bottom : _top,
	    	compareBottom	= partial === true ? _top : _bottom;
		
		return ((compareBottom <= viewBottom) && (compareTop >= viewTop));
    };
})(jQuery);
