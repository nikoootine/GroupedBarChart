/**
 * Create GroupedBarChart object
 * @param {Object} param - an object with the following fields:
 *                          {number} width - the width of the svg element
 *                          {number} height - the height of the svg element
 *                          {string} elem - selector for the element to append the svg element to
 *                          {string} chartTitle - title for the chart
 *                          {string} xAxisLabel - label for the x-Axis
 *                          {string} yAxisLabel - label for the y-Axis
 *                          {string} zAxisLabel - label for the z-Axis
 *                          {object} margin - object with the following fields:
 *                              {number} top - top margin
 *                              {number} right - right margin
 *                              {number} bottom - bottom margin
 *                              {number} left - left margin
 */

var GroupedBarChart = function(param)
{
    var width = param.width;
    var height = param.height;
    var elem = param.elem;
    var chartTitle = param.chartTitle;
    var xAxisLabel = param.xAxisLabel;
    var yAxisLabel = param.yAxisLabel;
    var zAxisLabel = param.zAxisLabel;
    var tooltipTitle = param.tooltipTitle;
    var maxGroup = 100;
    var maxBars  = 15;
    var margin = { top: 57, right: 57, bottom: 57, left: 57 };
    var svg = d3.select(elem)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .call(responsivefy)
        .append('g')
        .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')
    ;

    var tooltip = d3.select(elem).append("div")
        .attr("class", "tooltip")
        .style("opacity", 0)
    ;

    return {
        h: height - margin.top - margin.bottom,
        w: width - margin.left - margin.right,
        precision : null,
        svg: svg,
        xScale: null,
        x1Scales : null,
        xAxis: null,
        yScale: null,
        yAxis: null,
        zScale: null,
        zAxis: null,
        colors : null,
        mainCategories : null,
        subCategories : null,
        maxSubCategoryLength : null,
        addLine: null,
        dateFormatString: null,
        dataLength: null,

        /**
         * Set the scales for the chart based on the data and it's domain
         * @param data - parsed data from the input json
         */
        setScales: function(data, applicationColors)
        {
            var that = this;

            that.mainCategories = _.first(_.uniq(_.pluck(data, 'xval')), maxGroup);
            that.subCategories  = _.map(that.mainCategories, category => {
                return  {
                    mainCategory  : category,
                    subCategories : _.first(_.pluck(_.where(data, { xval : category }), 'name'), maxBars)
                };
            });


            that.maxSubCategoryLength = _.max(_.map(that.subCategories, sub => { return sub.subCategories.length}));

            // Rounding function for max/min values
            function roundx(n, x){ return Math.ceil(n/x)*x;}
            function roundmin(n, x){ return Math.floor(n/x)*x;}
            // Finds the number of digits before the decimal, for dynamic rounding
            function numDigits(x) {
                var n =  Math.trunc(Math.abs(x)).toString().length;
                var tmp = "1";
                for(var i = 1; i < n; i++) {
                    tmp += '0';
                }
                return parseInt(tmp);
            }
            /*
               Sets the scaling on the Y axis. Sets the max as the highest data,
               rounding up. Sets the min value just below the lowest data value.
            */
            that.yScale = d3.scale.linear()
                .domain([roundmin(_.min(_.pluck(data, 'yval')),numDigits(_.min(_.pluck(data, 'yval')))) - numDigits(_.min(_.pluck(data, 'yval'))),
                           roundx(_.max(_.pluck(data, 'yval')),numDigits(_.max(_.pluck(data, 'yval')))) ])
                .range([that.h, 0])
            ;
            /*
               Sets the distance between groups such that they are spread out evenly.
            */
            that.xScale = d3.scale.ordinal()
                .domain(that.mainCategories.map(function(d){ return d; }))
                .rangeBands([0, that.w], 0.5)
            ;

            that.x1Scales   = _.map(that.subCategories, subCategory => {
                var factor    = subCategory.subCategories.length / that.maxSubCategoryLength;

                return {
                    x1Scale : d3.scale.ordinal()
                        .domain(subCategory.subCategories)
                        .rangeBands([0, that.xScale.rangeBand() * factor]),
                    mainCategory : subCategory.mainCategory
                };
            });

            /*
              Sets the zScale (volume measurement) in the same way as the Yaxis.
            */
            that.zScale = d3.scale.linear()
                .domain([roundmin(_.min(_.pluck(data, 'zval')),numDigits(_.min(_.pluck(data, 'zval')))) - numDigits(_.min(_.pluck(data, 'zval'))),
                           roundx(_.max(_.pluck(data, 'zval')),numDigits(_.max(_.pluck(data, 'zval'))))])
                .range([that.h, 0])
            ;

            that.xAxis  = d3.svg.axis()
                .scale(that.xScale)
                .orient("bottom")
            ;
            that.yAxis  = d3.svg.axis()
                .scale(that.yScale)
                .orient("left")
            ;
            that.zAxis  = d3.svg.axis()
                .scale(that.zScale)
                .orient("right")
            ;

            /* Any array of colors, injected from the index currently */
            that.colors = applicationColors;
        },

        /**
         * Does some processing for json data. Groups year-months together or year-month-days together.
         * Takes the aggregate z-axis values and average y-axis values for each group.
         * @param data - parsed data from input json
         * @returns processed data
         */
        setGroupedBarChartData : function(data)
        {
            var values;
            var that        = this;
            var isValidData = (data[0].breakdowntype === "STRING" || data[0].breakdowntype === "YMD" || data[0].breakdowntype === "YM" || data[0].breakdowntype === "YW");
            var isDateData  = isValidData && data[0].breakdowntype !== "STRING";

            if (data[0].breakdowntype == "STRING")
            {
                values = _.map(data, function(d) {
                    var data_value = {};
                        data_value.xval = d.xval;
                        data_value.yval = d.yval;
                        data_value.name = d.name;

                    // Only add zval into the data object if there is a zval
                    if(d.zval !== undefined) {
                        data_value.zval = d.zval;
                    }

                    return data_value;
                });

            } else if (data[0].breakdowntype == "YM") {
                values = _.map(data, function(d) {
                    var data_value = {};
                    data_value.xval = that.toDate(d.xval).format("MMM DD");
                    data_value.yval = d.yval;
                    data_value.name = d.name;

                    // Only add zval into the data object if there is a zval
                    if(d.zval !== undefined) {
                      data_value.zval = d.zval;
                    }
                    return data_value;
                });
            } else if (data[0].breakdowntype == "YMD"){
              values = _.map(data, function(d) {
                    var data_value = {};
                    data_value.xval = that.toDate(d.xval).format("MMM DD YYYY");
                    data_value.yval = d.yval;
                    data_value.name = d.name;

                    // Only add zval into the data object if there is a zval
                    if(d.zval !== undefined) {
                      data_value.zval = d.zval;
                    }
                    return data_value;
                });
            } else if (data[0].breakdowntype == "YW") {
                values = _.map(data, function(d) {
                    var data_value = {};
                    data_value.xval = that.toDate(d.xval).format("MMM DD");
                    data_value.yval = d.yval;
                    data_value.name = d.name;
                    // Only add zval into the data object if there is a zval
                    if(d.zval !== undefined) {
                      data_value.zval = d.zval;
                    }
                    return data_value;
                });
	        }
            return isDateData ? _.sortBy(values, function(d) {
                return that.toDate(d.xval) - 0;
            }) : values;
        },

        // Deletes the current chart, used for switching datasets
        deleteChart: function(){
            this.svg.selectAll('g').each(function () {
                $(this).remove();
            });
        },

        /**
         * Initializes the chart. Sets the scales and generates the axes and grid lines.
         * @param data - parsed data from the input json
         */
        initChart : function(data, precision, applicationColors) {
            this.deleteChart();
            var that = this;
            that.setScales(data,applicationColors);
            that.precision = precision;

            svg.append("g")
                .attr("class", "y axis")
                .call(that.yAxis)
            ;

            svg.append("g")
                .attr("class", "x axis")
                .attr("transform", "translate(0," + that.h + ")")
                .call(that.xAxis)
            ;
            svg.append("g")
                .attr("class", "z axis")
                .attr("transform", "translate(" + that.w +",0)")
                .call(that.zAxis)
            ;
        },
        /**
         * Updates the chart based on the data passed in.
         * @param data - parsed data from input json
         */
        updateChart : function(data)
        {
            var that = this;

            /*Color array is randomized on each refresh*/
            that.colors = _.shuffle(that.colors);
            //Lighten Darken Function by Chris Coyier
            //Used to lighten the colors of each group from left to right
            function lightenDarkenColor(col, amt) {
                var usePound = false;
                if (col[0] == "#") {
                    col = col.slice(1);
                    usePound = true;
                }
                var num = parseInt(col,16);
                var r = (num >> 16) + amt;
                if (r > 255) r = 255;
                else if  (r < 0) r = 0;
                var b = ((num >> 8) & 0x00FF) + amt;
                if (b > 255) b = 255;
                else if  (b < 0) b = 0;
                var g = (num & 0x0000FF) + amt;
                if (g > 255) g = 255;
                else if (g < 0) g = 0;
                /*Fixed Lighten algorithm, was truncating hexes randomly.*/
                var result = "000000" + (g | (b << 8) | (r << 16)).toString(16);
                result = result.substr(-6);
                result = (usePound?"#":"") + result;
                return result;
            }
            /* The amount that bars are darkened on Mouseover */
            var mouseOverDarken = -30;
            /* Reverses the effect of the darken on mouseout */
            var mouseOverReverse = -1 * mouseOverDarken;

            var tooltip_mouseover = function(d) {
                /* Select the bar that calls mouseover and darkens the bar */
                var bar = d3.select(this);
                bar.attr("fill", lightenDarkenColor(bar.attr("fill"), mouseOverDarken));
                /* The string for the text in the tooltip. */
                var tooltipText = '';
                if (d.name!==undefined)
                    tooltipText = "<strong>" + d.name + "</strong><br>";
                if (d.yval!==undefined)
                    tooltipText +=  "Score: <strong>" + d.yval.toFixed(that.precision)  + "</strong><br>";
                if (d.zval!==undefined)
                    tooltipText += "Volume: <strong>" + d.zval.toFixed(that.precision)  + "</strong><br>";

                tooltip.transition()
                    .duration(200)
                    .style("opacity", 1);
                tooltip.html(tooltipText)
                    .style("border-color", d3.select(this).attr("fill"))
                    .style("background-color", "#FFFFFF")
                    ;
            };

            var tooltip_mousemove = function(d) {
                var mouseContainer = d3.select(elem + " svg");
                var mouseCoords    = d3.mouse(mouseContainer.node());
                /* Sets the positioning of the tooltip. Hovers above the mouse. */
                d3.select(elem + " div.tooltip")
                    .style("left", (mouseCoords[0]) + "px")
                    .style("top",  (mouseCoords[1]) - 50 + "px");
                if(d.zval) {
                    d3.select(elem + " div.tooltip")
                        .style("top",  (mouseCoords[1]) - 65 + "px");
                }
            };

            var tooltip_mouseout = function()
            {
                /*Select the bar that calls mouseout and reverse the darken effect*/
                var bar = d3.select(this);
                bar.attr("fill", lightenDarkenColor(bar.attr("fill"), mouseOverReverse));

                tooltip.transition()
                    .duration(200)
                    .style("opacity", 0);
            };
            /* Transition Functions */
            /* Enter the data into the dom */
            var barsAnimationTime = data.length * 50;
            svg.append("g").selectAll("g")
                .data(that.mainCategories)
                .enter().append("g")
                .attr("transform", function(d) { return "translate(" + that.xScale(d) + ",0)"; })
                .selectAll("rect")
                .data(function(d){ return _.first(_.where(data, {xval: d}), maxBars); })
                .enter().append("rect")
                .attr("x", function(d) {
                      var x1                  = (_.findWhere(that.x1Scales, { mainCategory : d.xval})).x1Scale;
                      var subCategoriesLength = (_.findWhere(that.subCategories, {mainCategory : d.xval})).subCategories.length;
                      var outerPadding        = (that.xScale.rangeBand() - (subCategoriesLength * x1.rangeBand()))/2;
                      return x1.range().length  < that.maxSubCategoryLength ? (outerPadding + x1(d.name)) : x1(d.name);
                })
                .attr("y", that.h)
                .attr("width", function(d) { var x1 = (_.findWhere(that.x1Scales, { mainCategory : d.xval})).x1Scale; return x1.rangeBand(); } )
                .attr("height", 0)
                .attr("fill", function(d, i) { return lightenDarkenColor(that.colors[_.indexOf(that.mainCategories, d.xval )], i*15); })
                //disable pointer events.
                .on('mouseover',tooltip_mouseover)
                .on('mousemove',tooltip_mousemove)
                .on('mouseout',tooltip_mouseout)
                .style("pointer-events", "none")
                // The transition produces a bouncing effect for the bar
                .transition()
                .delay((d,i) => { return _.indexOf(data, d) * 50; })
                .duration(barsAnimationTime)
                .ease("elastic")
                // Turn back to original height
                .attr('y', function(d) { return that.yScale(d.yval); })
                .attr('height', function(d) { return that.h - that.yScale(d.yval); })
                //allow pointer events after animation is finished
                .style("pointer-events", "")
            ;



            /*Data point funcitons*/
            var c_mouseover = function(d){
                var mouseContainer = d3.select(elem + " svg");
                var mouseCoords    = d3.mouse(mouseContainer.node());
                var ballToolTipText = '';
                if (d.x1!==undefined)
                    ballToolTipText = "<strong>" + d.x1 + "</strong><br>";
                if (d.y!==undefined)
                    ballToolTipText +=  "Score: <strong>" + d.y.toFixed(that.precision)  + "</strong><br>";
                if (d.z!==undefined)
                    ballToolTipText +=  "Volume: <strong>" + d.z.toFixed(that.precision)  + "</strong><br>";
                tooltip.transition()
                    .duration(200)
                    .style("opacity", 1);

                tooltip.html(ballToolTipText)
                    .style("border-color", d3.select(this).attr("fill"))
                    .style("background-color", "#FFFFFF")
                    .style("left", (mouseCoords[0]) + "px")
                    .style("top",  (mouseCoords[1]) - 50 + "px")
                ;
                d3.select(this)
                    .classed('hover', true)
                    .transition()
                    .duration(400)
                    .attr('r', 5 * 1.5)
                    .transition()
                    .duration(150)
                    .attr('r', 5 * 1.25);
            };

            var c_mouseout = function(d){
                tooltip.transition()
                    .duration(200)
                    .style("opacity", 0);
                d3.select(this)
                    .classed('hover', false)
                    .transition()
                    .duration(150)
                    .attr('r', 5);
            };

            that.addYLine = d3.svg.line()
                .x(
                    function(d)
                    {
                        var x1                  = (_.findWhere(that.x1Scales, { mainCategory : d.x0})).x1Scale;
                        var subCategoriesLength = (_.findWhere(that.subCategories, {mainCategory : d.x0})).subCategories.length;
                        var outerPadding        = (that.xScale.rangeBand() - (subCategoriesLength * x1.rangeBand()))/2;

                        return x1.range().length  < that.maxSubCategoryLength ? (outerPadding + that.xScale(d.x0) + x1.rangeBand()/2) : outerPadding + that.xScale(d.x0) + x1.rangeBand()/2;
                    }
                )
                .y(
                    function(d)
                    {
                        return that.yScale(d.y);
                    }
                )
            ;


            /*data point data*/
            var circleAniminationTime = 500;
            var lineanimationTime = 1000;
            var ylineData = _.map(_.where(data, {name: "Total Average"}), function(d){
                return {
                    x0: d.xval,
                    x1: d.name,
                    y:d.yval
                };
            });

            /*Data Point render*/
            var yLine = that.svg.call(responsivefy)
                .append("g")
                .attr("class", "yLine")
            ;

            /*Line stuff.*/
            var yPath = yLine.append("path")
                .attr("class", "line")
                .attr('fill', "none")
                .attr("stroke-width", 2)
                .attr("d", that.addYLine(ylineData))
                .data(ylineData)
            ;
            /*As an object, this is one solid line, so cannot be multicolored.*/
            var totalLength = yPath.node().getTotalLength();
            yPath.attr("stroke-dasharray", totalLength + " " + totalLength)
                .attr("stroke-dashoffset", totalLength)
                .transition()
                .delay(barsAnimationTime+circleAniminationTime)
                .duration(lineanimationTime)
                .attr("stroke-dashoffset", 0)
                .attr('stroke', that.colors[that.colors.length-2])
                .ease("linear")
                .attr("stroke-width", 2)
                .attr("stroke-dashoffset", 0)
            ;

            var yDatapoints = yLine.selectAll("circle")
                .data(ylineData)
                .enter().append("circle")
                .attr('stroke', function(d, i){return "white";})
                .attr('stroke-width', "0.5")
                /*Disable pointer events*/
                .on('mouseover',c_mouseover)
                .on('mouseout',c_mouseout)
                .attr('cx', function(d) {
                    var x1                  = (_.findWhere(that.x1Scales, { mainCategory : d.x0})).x1Scale;
                    var subCategoriesLength = (_.findWhere(that.subCategories, {mainCategory : d.x0})).subCategories.length;
                    var outerPadding        = (that.xScale.rangeBand() - (subCategoriesLength * x1.rangeBand()))/2;
                    return x1.range().length  < that.maxSubCategoryLength ? (outerPadding + that.xScale(d.x0) + x1.rangeBand()/2) : that.xScale(d.x0) + x1.rangeBand()/2;
                })
                .attr('cy', function (d) { return that.yScale(d.y); })
                .attr("fill", function(d, i){
                    return that.colors[i];
                })
                .style("pointer-events", "none")
                .transition().delay(function(d, i) {return barsAnimationTime + 50 + (i * 50);})
                // Each bar will be delayed depending on its position in the graph
                .duration(circleAniminationTime/2)
                // Expand height first (bounce effect)
                .attr('r', 5)
                .attr('cy', function (d) { return that.yScale(d.y) - 30; })
                .transition()
                .duration(circleAniminationTime/2)
                // Lower the height after (bounce effect)
                .attr('cy', function (d) { return that.yScale(d.y);})
                // Turn back to original height
                /*Allow pointer events at end of animation*/
                .each("end", function(){
                    d3.select(this).style("pointer-events", "");
                })
            ;

            that.addZLine = d3.svg.line()
                .x(
                    function(d)
                    {
                        var x1                  = (_.findWhere(that.x1Scales, { mainCategory : d.x0})).x1Scale;
                        var subCategoriesLength = (_.findWhere(that.subCategories, {mainCategory : d.x0})).subCategories.length;
                        var outerPadding        = (that.xScale.rangeBand() - (subCategoriesLength * x1.rangeBand()))/2;

                        return x1.range().length  < that.maxSubCategoryLength ? (outerPadding + that.xScale(d.x0) + x1.rangeBand()/2) : outerPadding + that.xScale(d.x0) + x1.rangeBand()/2;
                    }
                )
                .y(
                    function(d)
                    {
                        return that.zScale(d.z);
                    }
                )
            ;

            /*Z data point data*/
            /*Get all data elemets that have a z value*/
            var zlineData = _.map(_.filter(data, function(d){ return d.hasOwnProperty("zval");}), function(d){
                return {
                    x0: d.xval,
                    x1: d.name,
                    z: d.zval
                };
            });
            console.log(zlineData);

            /*Data Point render*/
            var zLine = that.svg.call(responsivefy)
                .append("g")
                .attr("class", "zLine")
            ;

            /*Z Path*/
            var zPath = zLine.append("path")
                .attr("class", "line")
                .attr('fill', "none")
                .attr("stroke-width", 2)
                .attr("d", that.addZLine(zlineData))
                .data(zlineData)
            ;
            /*As an object, this is one solid line, so cannot be multicolored.*/
            var totalLengthZ = zPath.node().getTotalLength();

            zPath.attr("stroke-dasharray", totalLengthZ + " " + totalLengthZ)
                .attr("stroke-dashoffset", totalLengthZ)
                .transition()
                .delay((barsAnimationTime+circleAniminationTime)*2)
                .duration(lineanimationTime)
                .attr("stroke-dashoffset", 0)
                .attr('stroke', that.colors[that.colors.length-1])
                .ease("linear")
                .attr("stroke-width", 2)
                .attr("stroke-dashoffset", 0)
            ;

            var zDatapoints = zLine.selectAll("circle")
                .data(zlineData)
                .enter().append("circle")
                /*Disable pointer events*/
                .attr('stroke', function(d, i){return "white";})
                .attr('stroke-width', "0.5")
                .on('mouseover',c_mouseover)
                .on('mouseout',c_mouseout)
                .on('click',function(){console.log("cirle onlick");})
                .attr('cx', function(d) {
                    var x1                  = (_.findWhere(that.x1Scales, { mainCategory : d.x0})).x1Scale;
                    var subCategoriesLength = (_.findWhere(that.subCategories, {mainCategory : d.x0})).subCategories.length;
                    var outerPadding        = (that.xScale.rangeBand() - (subCategoriesLength * x1.rangeBand()))/2;
                    return x1.range().length  < that.maxSubCategoryLength ? (outerPadding + that.xScale(d.x0) + x1.rangeBand()/2) : that.xScale(d.x0) + x1.rangeBand()/2;
                })
                .attr('cy', function (d) { return that.zScale(d.z); })
                .attr("fill", function(d, i){
                    return that.colors[that.colors.length-2];
                })
                .style("pointer-events", "none")
                .transition().delay(function(d, i) {return circleAniminationTime+(barsAnimationTime*2) + 50 + (i * 50);})
                // Expand height first (bounce effect)
                .duration(circleAniminationTime/2)
                .attr('r', 5)
                .attr('cy', function (d) { return that.zScale(d.z) - 30; })
                .transition()
                .duration(circleAniminationTime/2)
                // Lower the height after (bounce effect)
                .attr('cy', function (d) { return that.zScale(d.z);})
                // Turn back to original height
                .each("end", function(){
                    d3.select(this).style("pointer-events", "");
                })
            ;
        },
        /**
         * Checks if a string represents a date
         * @param {string} the string to check
         * @returns {bool} whether the string is a date or not
         */
        isDate: function(data)
        {
            var dateFormat = "MMM-DD-YYYY";
            return moment(data, dateFormat, false).isValid();
        },
        /**
         * Returns a date object for a string
         * @param {string} the string to get a date for
         * @returns {object} a date object representing the string
         */
        toDate: function(date)
        {
            var dateFormat = "MMM-DD-YYYY";
            return moment(date, dateFormat, false);
        }
    };
};
