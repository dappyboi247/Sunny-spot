#target aftereffects
#targetengine "sky_text_effect_v9"

(function (thisObj) {
    var VERSION = "v9";

    function activeComp() {
        if (!app.project) { return null; }
        var item = app.project.activeItem;
        if (item && item instanceof CompItem) { return item; }
        return null;
    }

    function createPingLayer() {
        var comp = activeComp();
        if (!comp) {
            throw new Error("Open a comp first.");
        }

        app.beginUndoGroup("Sky Ping " + VERSION);
        try {
            var n = comp.layers.addNull();
            n.name = "SKY_PING_" + VERSION + "_" + (new Date().getTime());
            n.property("Transform").property("Position").setValue([comp.width / 2, comp.height / 2]);
            return n.name;
        } finally {
            app.endUndoGroup();
        }
    }

    function buildUI(thisObj) {
        var win = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", "sky_text_effect " + VERSION, undefined, { resizeable: true });

        win.orientation = "column";
        win.alignChildren = ["fill", "top"];
        win.margins = 12;
        win.spacing = 8;

        win.add("statictext", undefined, "SKY TEXT EFFECT " + VERSION);
        var applyBtn = win.add("button", undefined, "Apply Effect");
        var status = win.add("statictext", undefined, "Ready " + VERSION + ".");

        function setStatus(msg) {
            status.text = msg;
            win.update();
            $.writeln("sky_text_effect " + VERSION + ": " + msg);
        }

        applyBtn.onClick = function () {
            setStatus("Running " + VERSION + "...");
            try {
                var layerName = createPingLayer();
                setStatus("Done: " + layerName);
                alert("Created: " + layerName);
            } catch (e) {
                setStatus("ERROR: " + e.message);
                alert("ERROR: " + e.message);
            }
        };

        return win;
    }

    var panel = buildUI(thisObj);
    if (panel instanceof Window) {
        panel.center();
        panel.show();
    } else {
        panel.layout.layout(true);
    }
})(this);
