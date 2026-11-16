<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">

<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
<head>
	<title>A Song of Ice and Fire - Speculative world map</title>
		<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" />
	<meta name="keywords" content="A Song of Ice and Fire, animated timeline map, timeline, Westeros, George RR Martin, A Game of Thrones, A Clash of Kings, A Storm of Swords, A Feast For Crows, ASOIAF, AGOT, ACOK, ASOS, AFFC, BWB, Brotherhood Without Banners, Worldcon" lang="en" />
	<meta name="description" content="serMountainGoat's website including: Animated timeline map of events from A Song of Ice and Fire by George RR Martin including character location by date, Worldcon and BWB meet up reports, photo gallery, reviews, parodies, skins for Westeros and more." lang="en" />
	<meta name="author" content="Phil Lowles"  lang="en" />

	<script type="text/javascript" language="javascript" src="/scripts/css_browser_selector.js"></script>
	<link href="/styles/mg_styles.css" rel="stylesheet" type="text/css" />
	<link type="text/css" rel="stylesheet" href="/styles/mg_other_styles.css" />
	<!--[if IE]><link href="/styles/mg_ie_styles.css" rel="stylesheet" type="text/css" /><![endif]-->	<script type="text/javascript" language="javascript" src="/scripts/sp_map.js"></script>
</head>

<body onload="css_browser_selector();">

	<h1>A Song of Ice and Fire - Speculative world map</h1>

	<iframe src="map.html" name="map_pane" id="map_pane" width="838px" height="654px" scrolling="yes">
	</iframe>

	<div class="sp_map_stuff">

		<div class="sp_map_controls">
			<p class="select_heading">Map zoom:</p>
			<ul class="zoom">
				<li><a href="javascript:viewDefault();" title="Set map to 100%"><img src="../timeline/images/show_all.png" alt="View default" name="view_default" onmouseover="document.view_default.src='../timeline/images/show_all_over.png';" onmouseout="document.view_default.src='../timeline/images/show_all.png';" /></a></li>
				<li><a href="javascript:zoomIn();" title="Enlarge map to 150%"><img src="../timeline/images/zoom_in.png" alt="Zoom in" name="zoom_in" onmouseover="document.zoom_in.src='../timeline/images/zoom_in_over.png';" onmouseout="document.zoom_in.src='../timeline/images/zoom_in.png';" /></a></li>
				<li><a href="javascript:zoomOut();" title="Reduce map to 50%"><img src="../timeline/images/zoom_out.png" alt="Zoom out" name="zoom_out" onmouseover="document.zoom_out.src='../timeline/images/zoom_out_over.png';" onmouseout="document.zoom_out.src='../timeline/images/zoom_out.png';" /></a></li>
				<li class="last"><a href="javascript:showAll();" title="Show the entire map"><img src="../timeline/images/view_default.png" alt="Show all" name="show_all" onmouseover="document.show_all.src='../timeline/images/view_default_over.png';" onmouseout="document.show_all.src='../timeline/images/view_default.png';" /></a></li>
			</ul>

			<p class="select_heading">Map features:</p>
			<ul>
				<li>
					<label for="locations">Show town/city markers</label>
					<input type="checkbox" name="locations" id="locations" value="1" checked="checked" onclick="checkLocations();" />
				</li>
				<li>
					<label for="labels">Show labels</label>
					<input type="checkbox" name="labels" id="labels" value="1" checked="checked" onclick="checkLabels();" />
				</li>
				<li>
					<label for="spec">Show speculative locations</label>
					<input type="checkbox" name="spec" id="spec" value="1" checked="checked" onclick="checkSpec();" />
				</li>
				<li>
					<label for="non-canon">Show non-canon markings</label>
					<input type="checkbox" name="non_canon" id="non_canon" value="1" checked="checked" onclick="checkNonCanon();" />
				</li>
				<li>
					<label for="roads">Show roads</label>
					<input type="checkbox" name="roads" id="roads" value="1" checked="checked" onclick="checkRoads();" />
				</li>
				<li>
					<label for="wall">Show wall</label>
					<input type="checkbox" name="wall" id="wall" value="1" checked="checked" onclick="checkWall();" />
				</li>
			</ul>
		</div>

		<div class="download_maps">
			<p>Download maps:</p>
			<ul>
				<li><a href="versions/speculative_map.jpg" title="Download the full speculative map">Full speculative map</a> <span class="format_size">[jpg, 5.4mb]</span></li>
				<li><a href="versions/map_natural.jpg" title="Download the natural map (no labels, no location markers)">Natural map</a> <span class="format_size">[jpg, 4.4mb]</span></li>
				<li><a href="versions/map_no_labels.jpg" title="Download the no labels map (location markers only)">No labels map</a> <span class="format_size">[jpg, 4.4mb]</span></li>
				<li><a href="versions/map_canon_only.jpg" title="Download the canon only map (non-canon locations removed)">Canon only map</a> <span class="format_size">[jpg, 5.4mb]</span></li>
			</ul>
		</div>

		<div class="sp_map_ge">
			<a href="/posts/google_earth/index.php" title="View Speculative World Map in Google Earth"><span>View Speculative World Map in Google Earth:</span></a>
		</div>

	</div>

	<br clear="all" />

		<div id="bottom" class="footer">
		<ul class="footer-links">
			<li><a href="/index.php" title="home page">home</a></li>
			<li><a href="/timeline/index.php" title="Animated timeline map for A Song of Ice and Fire">animated timeline map</a></li>
			<li><a href="/map/index.php" title="A Song of Ice and Fire - Speculative World Map">speculative world map</a></li>
			<li><a href="/posts/google_earth/index.php" title="Westeros in Google Earth">google earth</a></li>
			<li><a href="/skins/index.php" title="Stark and Targaryen skins for the Westeros Forum">westeros skins</a></li>
			<li><a href="/reports/index.php" title="Worldcon and other BWB meet-up reports">worldcon reports</a></li>
			<li><a href="/gallery/index.php" title="Photo gallery to accompany the reports">photo gallery</a></li>
			<li><a href="/posts/index.php" title="A collection of posts by MG on the Westeros Forum including NHAW reviews, Spam review archive, parodies written by MG and other interesting posts">posted on westeros</a></li>
			<li><a href="/about/index.php" title="Want to know more about the Goat?">about MG</a></li>
			<li class="last-footer-link"><a href="/about/contact.php" title="Contact MG">contact MG</a></li>
		</ul>
		<ul class="footer-links">
			<li>Connected websites:- &nbsp; &nbsp; <a href="http://enlightenmenthk.net" title="Visit the EHK memorial website" target="_blank">www.enlightenmenthk.net</a></li>
			<li class="last-footer-link"><a href="http://www.titancon.com" title="TitanCon website" target="_blank">www.titancon.com</a></li>
		</ul>
		<p class="copyright">&copy; 2010-2026 ~ theMountainGoat</p>
	</div>
	<div class="hidden">
		<img src='../timeline/images/zoom_in_over.png' alt="preloaded zoom in hover state button" />
		<img src='../timeline/images/zoom_out_over.png' alt="preloaded zoom out hover state button" />
		<img src='../timeline/images/show_all_over.png' alt="preloaded show all hover state button" />
		<img src='../timeline/images/view_default_over.png' alt="preloaded view default hover state button" />
	</div>

</body>
</html>