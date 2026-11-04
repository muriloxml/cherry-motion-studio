/**
 * Cherry Motion Studio - Native Premiere Pro ExtendScript Host Bridge
 * Full ES3 Compatibility with embedded JSON2 serializer
 * ProRes 4444 Native Engine & In-Place Hot-Swap
 */

if (typeof $ === 'undefined') {
    $ = {};
}

// Embedded Crockford JSON2 polyfill for ExtendScript ES3
if (typeof JSON !== 'object') {
    JSON = {};
}
(function () {
    'use strict';
    var rx_one = /^[\],:{}\s]*$/;
    var rx_two = /\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g;
    var rx_three = /"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g;
    var rx_four = /(?:^|:|,)(?:\s*\[)+/g;
    var rx_escapable = /[\\\"\u0000-\u001f\u007f-\u009f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
    var meta = {
        '\b': '\\b',
        '\t': '\\t',
        '\n': '\\n',
        '\f': '\\f',
        '\r': '\\r',
        '"': '\\"',
        '\\': '\\\\'
    };
    function quote(string) {
        rx_escapable.lastIndex = 0;
        return rx_escapable.test(string) ? '"' + string.replace(rx_escapable, function (a) {
            var c = meta[a];
            return typeof c === 'string'
                ? c
                : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    }
    function str(key, holder) {
        var i, k, v, length, mind = '', partial, value = holder[key];
        if (value && typeof value === 'object' && typeof value.toJSON === 'function') {
            value = value.toJSON(key);
        }
        switch (typeof value) {
        case 'string':
            return quote(value);
        case 'number':
            return isFinite(value) ? String(value) : 'null';
        case 'boolean':
        case 'null':
            return String(value);
        case 'object':
            if (!value) return 'null';
            partial = [];
            if (Object.prototype.toString.apply(value) === '[object Array]') {
                length = value.length;
                for (i = 0; i < length; i += 1) {
                    partial[i] = str(i, value) || 'null';
                }
                return '[' + partial.join(',') + ']';
            }
            for (k in value) {
                if (Object.prototype.hasOwnProperty.call(value, k)) {
                    v = str(k, value);
                    if (v) {
                        partial.push(quote(k) + ':' + v);
                    }
                }
            }
            return '{' + partial.join(',') + '}';
        }
    }
    if (typeof JSON.stringify !== 'function') {
        JSON.stringify = function (value) {
            return str('', {'': value});
        };
    }
    if (typeof JSON.parse !== 'function') {
        JSON.parse = function (text) {
            var j;
            text = String(text);
            rx_escapable.lastIndex = 0;
            if (rx_one.test(text.replace(rx_two, '@').replace(rx_three, ']').replace(rx_four, ''))) {
                j = eval('(' + text + ')');
                return j;
            }
            throw new SyntaxError('JSON.parse error');
        };
    }
}());

var CherryExtendScript = {
    ping: function() {
        return JSON.stringify({
            status: "online",
            host: "premiere-pro",
            version: app.version
        });
    },

    getSequenceInfo: function() {
        try {
            var seq = app.project ? app.project.activeSequence : null;
            if (!seq) return JSON.stringify({ hasSeq: false });

            var settings = null;
            try { settings = seq.getSettings(); } catch(e){}
            var fps = 30;
            var width = 1920;
            var height = 1080;
            if (settings) {
                try { fps = 1 / settings.videoFrameRate.seconds; } catch(e){}
                try { width = settings.videoFrameWidth; } catch(e){}
                try { height = settings.videoFrameHeight; } catch(e){}
            }

            var playhead = 0;
            try { playhead = seq.getPlayerPosition().seconds; } catch(e){}
            var prPath = "";
            try { prPath = app.project.path || ""; } catch(e){}
            var prName = "Premiere Pro";
            try { prName = app.project.name || "Premiere Pro"; } catch(e){}

            return JSON.stringify({
                hasSeq: true,
                seqName: seq.name,
                seqId: seq.sequenceID,
                fps: Math.round(fps * 100) / 100,
                playhead: Math.round(playhead * 100) / 100,
                width: width,
                height: height,
                videoTracks: seq.videoTracks ? seq.videoTracks.numTracks : 0,
                projectName: prName,
                projectPath: prPath
            });
        } catch (e) {
            return JSON.stringify({ hasSeq: false, error: e.toString() });
        }
    },

    getSelectedClipInfo: function() {
        try {
            var seq = app.project ? app.project.activeSequence : null;
            if (!seq) return JSON.stringify({ hasSeq: false });

            var sel = seq.getSelection();
            var clip = null;

            if (sel && sel.length > 0) {
                for (var s = 0; s < sel.length; s++) {
                    var cand = sel[s];
                    if (cand && cand.name && cand.name.toLowerCase().indexOf("cherrymotion") !== -1) {
                        clip = cand;
                        break;
                    }
                    if (!clip && cand && cand.mediaType === "Video") {
                        clip = cand;
                    }
                }
                if (!clip) clip = sel[0];
            }

            if (!clip) {
                for (var t = 0; t < seq.videoTracks.numTracks; t++) {
                    var tr = seq.videoTracks[t];
                    for (var c = 0; c < tr.clips.numItems; c++) {
                        if (tr.clips[c] && tr.clips[c].isSelected && tr.clips[c].isSelected()) {
                            clip = tr.clips[c];
                            break;
                        }
                    }
                    if (clip) break;
                }
            }

            if (!clip) return JSON.stringify({ hasSeq: true, hasSelection: false });

            var prItem = null;
            try { prItem = clip.projectItem; } catch(e){}

            var mediaPath = "";
            try {
                if (prItem && prItem.getMediaPath) {
                    mediaPath = prItem.getMediaPath();
                }
            } catch(e){}

            var inSec = 0, outSec = 0, durSec = 0, startSec = 0, endSec = 0;
            try { inSec = clip.inPoint ? clip.inPoint.seconds : 0; } catch(e){}
            try { outSec = clip.outPoint ? clip.outPoint.seconds : 0; } catch(e){}
            try { durSec = clip.duration ? clip.duration.seconds : 0; } catch(e){}
            try { startSec = clip.start ? clip.start.seconds : 0; } catch(e){}
            try { endSec = clip.end ? clip.end.seconds : 0; } catch(e){}

            return JSON.stringify({
                hasSeq: true,
                hasSelection: true,
                clipName: clip.name || (prItem ? prItem.name : "Clip"),
                mediaPath: mediaPath,
                nodeId: clip.nodeId || "",
                inPoint: inSec,
                outPoint: outSec,
                duration: durSec,
                start: startSec,
                end: endSec
            });
        } catch (e) {
            return JSON.stringify({ hasSeq: false, error: e.toString() });
        }
    },

    changeClipMedia: function(targetPath, newPath) {
        try {
            var seq = app.project ? app.project.activeSequence : null;

            function normalize(p) {
                return (p || "").replace(/\\/g, "/").toLowerCase();
            }
            var targetNorm = normalize(targetPath);

            function getBaseName(p) {
                if (!p) return "";
                var parts = (p || "").replace(/\\/g, "/").split("/");
                return parts[parts.length - 1].toLowerCase();
            }
            var targetBase = getBaseName(targetPath);

            function findItem(item) {
                if (!item) return null;
                if (item.type === ProjectItemType.CLIP || item.type === ProjectItemType.FILE) {
                    try {
                        if (item.getMediaPath && normalize(item.getMediaPath()) === targetNorm) {
                            return item;
                        }
                    } catch(e){}
                    if (item.name && item.name.toLowerCase() === targetBase) {
                        return item;
                    }
                }
                if (item.children) {
                    for (var i = 0; i < item.children.numItems; i++) {
                        var res = findItem(item.children[i]);
                        if (res) return res;
                    }
                }
                return null;
            }

            var prItem = targetPath ? findItem(app.project.rootItem) : null;
            if (!prItem && seq) {
                var sel = seq.getSelection();
                if (sel && sel.length > 0 && sel[0].projectItem) {
                    prItem = sel[0].projectItem;
                }
            }

            if (!prItem) {
                return JSON.stringify({ success: false, error: "Clip nao encontrado no projeto: " + targetPath });
            }

            var fNew = new File(newPath);
            var ok = prItem.changeMediaPath(fNew.exists ? fNew.fsName : newPath, true);
            app.project.save();

            return JSON.stringify({
                success: true,
                updated: true,
                itemName: prItem.name,
                oldPath: targetPath,
                newPath: newPath,
                changed: ok
            });
        } catch (e) {
            return JSON.stringify({ success: false, error: e.toString() });
        }
    },

    updateSelectedClipMedia: function(newPath, targetPath) {
        return this.changeClipMedia(targetPath, newPath);
    },

    insertClipAtPlayhead: function(newPath, fileName, targetTrackIndex) {
        try {
            var seq = app.project ? app.project.activeSequence : null;
            if (!seq) return JSON.stringify({ success: false, error: "Nenhuma sequencia ativa no Premiere" });

            var f = new File(newPath);
            var importTarget = f.exists ? f.fsName : newPath;
            app.project.importFiles([importTarget], false, app.project.rootItem, false);

            var importedItem = null;
            var targetName = fileName || (f.name || "");
            for (var i = 0; i < app.project.rootItem.children.numItems; i++) {
                var it = app.project.rootItem.children[i];
                if (it.name === targetName || (f.name && it.name === f.name)) {
                    importedItem = it;
                    break;
                }
            }
            if (!importedItem && app.project.rootItem.children.numItems > 0) {
                importedItem = app.project.rootItem.children[app.project.rootItem.children.numItems - 1];
            }
            if (!importedItem) return JSON.stringify({ success: false, error: "Item importado nao encontrado" });

            var trackIdx = (targetTrackIndex !== undefined && targetTrackIndex !== null) ? Number(targetTrackIndex) : 1;
            if (trackIdx >= seq.videoTracks.numTracks) {
                trackIdx = seq.videoTracks.numTracks - 1;
            }

            var insertTime = new Time();
            insertTime.seconds = seq.getPlayerPosition().seconds;

            seq.overwriteClip(importedItem, insertTime, trackIdx, 0);

            var previewTime = new Time();
            previewTime.seconds = insertTime.seconds + 0.8;
            seq.setPlayerPosition(previewTime.ticks);

            app.project.save();
            return JSON.stringify({
                success: true,
                placedAt: insertTime.seconds,
                track: trackIdx,
                file: importedItem.name
            });
        } catch (e) {
            return JSON.stringify({ success: false, error: e.toString() });
        }
    },

    importAndInsertFile: function(newPath, fileName, targetTrackIndex, insertTimeSeconds) {
        try {
            var seq = app.project ? app.project.activeSequence : null;
            if (!seq) return JSON.stringify({ success: false, error: "Nenhuma sequencia ativa no Premiere" });

            var f = new File(newPath);
            var importTarget = f.exists ? f.fsName : newPath;
            app.project.importFiles([importTarget], false, app.project.rootItem, false);

            var importedItem = null;
            var targetName = fileName || (f.name || "");
            for (var i = 0; i < app.project.rootItem.children.numItems; i++) {
                var it = app.project.rootItem.children[i];
                if (it.name === targetName || (f.name && it.name === f.name)) {
                    importedItem = it;
                    break;
                }
            }
            if (!importedItem && app.project.rootItem.children.numItems > 0) {
                importedItem = app.project.rootItem.children[app.project.rootItem.children.numItems - 1];
            }
            if (!importedItem) return JSON.stringify({ success: false, error: "Item importado nao encontrado" });

            var trackIdx = (targetTrackIndex !== undefined && targetTrackIndex !== null) ? Number(targetTrackIndex) : 1;
            if (trackIdx >= seq.videoTracks.numTracks) {
                trackIdx = seq.videoTracks.numTracks - 1;
            }

            var insertTime = new Time();
            insertTime.seconds = (insertTimeSeconds !== undefined && insertTimeSeconds !== null) ? Number(insertTimeSeconds) : seq.getPlayerPosition().seconds;

            seq.overwriteClip(importedItem, insertTime, trackIdx, 0);

            var previewTime = new Time();
            previewTime.seconds = insertTime.seconds + 0.8;
            seq.setPlayerPosition(previewTime.ticks);

            app.project.save();
            return JSON.stringify({
                success: true,
                placedAt: insertTime.seconds,
                track: trackIdx,
                file: importedItem.name
            });
        } catch (e) {
            return JSON.stringify({ success: false, error: e.toString() });
        }
    },

    insertMogrtAtPlayhead: function(jsonPayload) {
        try {
            var data = (typeof jsonPayload === "string") ? JSON.parse(jsonPayload) : (jsonPayload || {});
            if (typeof data === "string") { try { data = JSON.parse(data); } catch(e){} }
            var seq = app.project ? app.project.activeSequence : null;
            if (!seq) return JSON.stringify({ success: false, error: "Nenhuma sequencia ativa no Premiere Pro." });

            var mogrtPath = data.mogrtPath || "";
            var f = new File(mogrtPath);
            if (!f.exists) {
                return JSON.stringify({ success: false, error: "Arquivo .mogrt nao encontrado: " + mogrtPath });
            }

            var playhead = seq.getPlayerPosition();
            var insertTicks = playhead ? playhead.ticks : "0";
            var vTrackOffset = (data.videoTrackOffset !== undefined && data.videoTrackOffset !== null) ? Number(data.videoTrackOffset) : 1;
            var aTrackOffset = (data.audioTrackOffset !== undefined && data.audioTrackOffset !== null) ? Number(data.audioTrackOffset) : 0;

            if (seq.videoTracks && vTrackOffset >= seq.videoTracks.numTracks) {
                vTrackOffset = seq.videoTracks.numTracks - 1;
            }

            var clip = seq.importMGT(f.fsName, insertTicks, vTrackOffset, aTrackOffset);
            if (!clip) {
                return JSON.stringify({ success: false, error: "Falha ao executar seq.importMGT no Premiere Pro." });
            }

            if (data.durationSec && Number(data.durationSec) > 0 && clip.end && clip.start) {
                try {
                    var newEnd = new Time();
                    newEnd.seconds = clip.start.seconds + Number(data.durationSec);
                    clip.end = newEnd;
                } catch(e){}
            }

            if (data.clipName) {
                try { clip.name = data.clipName; } catch(e){}
            }

            var mgt = null;
            if (clip.getMGTComponent) {
                try { mgt = clip.getMGTComponent(); } catch(e){}
            }
            if (!mgt && clip.components) {
                for (var c = 0; c < clip.components.numItems; c++) {
                    var comp = clip.components[c];
                    if (comp.matchName === "AE.ADBE Motion Graphic" || comp.displayName === "Graphic" || comp.displayName === "Motion Graphics Template" || (comp.properties && comp.properties.numItems > 0 && comp.displayName.indexOf("Motion") !== -1)) {
                        mgt = comp;
                        break;
                    }
                }
            }

            var updatedProps = [];
            var params = data.params || {};

            var textValues = [];
            var l1 = params.line1 || params.t1 || params.serif || params.w1 || params.top || params.title;
            var l2 = params.line2 || params.t2 || params.script || params.w2 || params.slam || params.sub;

            if (l1 && l2) {
                textValues.push(l1);
                textValues.push(l2);
            } else if (l1) {
                textValues.push(l1);
                if (params.text && params.text !== l1) textValues.push(params.text);
            } else if (l2) {
                if (params.text && params.text !== l2) textValues.push(params.text);
                textValues.push(l2);
            } else if (params.text) {
                textValues.push(params.text);
            }

            if (mgt && mgt.properties) {
                var textPropIndex = 0;
                for (var p = 0; p < mgt.properties.numItems; p++) {
                    var prop = mgt.properties[p];
                    if (params[prop.displayName] !== undefined) {
                        try {
                            prop.setValue(String(params[prop.displayName]), true);
                            updatedProps.push({ name: prop.displayName, value: String(params[prop.displayName]) });
                        } catch(e){}
                    } else if (textPropIndex < textValues.length) {
                        try {
                            prop.setValue(String(textValues[textPropIndex]), true);
                            updatedProps.push({ name: prop.displayName, value: String(textValues[textPropIndex]) });
                            textPropIndex++;
                        } catch(e){}
                    }
                }
            }

            // Support for native Premiere Pro Essential Graphics (.prgraphic) components
            if (clip.components) {
                var textCompIndex = 0;
                for (var c = 0; c < clip.components.numItems; c++) {
                    var comp = clip.components[c];
                    if (comp.matchName === "AE.ADBE Text" && comp.properties && comp.properties.numItems > 0) {
                        var srcProp = comp.properties[0];
                        if (srcProp && textCompIndex < textValues.length) {
                            try {
                                srcProp.setValue(String(textValues[textCompIndex]), true);
                                updatedProps.push({ name: comp.displayName + " [" + textCompIndex + "]", value: String(textValues[textCompIndex]) });
                                textCompIndex++;
                            } catch(e){}
                        }
                    } else if (comp.matchName === "AE.ADBE Shape" || comp.displayName === "Forma" || comp.displayName === "Shape") {
                        if (comp.properties) {
                            for (var p = 0; p < comp.properties.numItems; p++) {
                                var propName = comp.properties[p].displayName;
                                if (propName === "Opacidade" || propName === "Opacity") {
                                    try { comp.properties[p].setValue(0, true); } catch(e){}
                                }
                            }
                        }
                    }
                }
            }

            try {
                var previewPos = new Time();
                previewPos.seconds = clip.start.seconds + 0.4;
                seq.setPlayerPosition(previewPos.ticks);
            } catch(e){}

            app.project.save();

            return JSON.stringify({
                success: true,
                isMogrt: true,
                clipName: clip.name,
                start: clip.start ? clip.start.seconds : 0,
                duration: clip.duration ? clip.duration.seconds : (data.durationSec || 3.0),
                track: vTrackOffset,
                updatedProperties: updatedProps
            });
        } catch(e) {
            return JSON.stringify({ success: false, error: e.toString() });
        }
    },

    getSelectedMogrtInfo: function() {
        try {
            var seq = app.project ? app.project.activeSequence : null;
            if (!seq) return JSON.stringify({ hasSeq: false });

            var clip = null;
            var sel = seq.getSelection();
            if (sel && sel.length > 0) clip = sel[0];

            if (!clip && seq.videoTracks) {
                var curSec = seq.getPlayerPosition().seconds;
                for (var t = seq.videoTracks.numTracks - 1; t >= 0; t--) {
                    var tr = seq.videoTracks[t];
                    for (var c = 0; c < tr.clips.numItems; c++) {
                        var cl = tr.clips[c];
                        if (cl.start && cl.end && curSec >= cl.start.seconds && curSec < cl.end.seconds) {
                            clip = cl;
                            break;
                        }
                    }
                    if (clip) break;
                }
            }

            if (!clip) return JSON.stringify({ hasSeq: true, hasSelection: false });

            var mgt = null;
            if (clip.getMGTComponent) {
                try { mgt = clip.getMGTComponent(); } catch(e){}
            }
            if (!mgt && clip.components) {
                for (var c = 0; c < clip.components.numItems; c++) {
                    var comp = clip.components[c];
                    if (comp.matchName === "AE.ADBE Motion Graphic" || comp.displayName === "Graphic" || comp.displayName === "Motion Graphics Template" || (comp.properties && comp.properties.numItems > 0 && comp.displayName.indexOf("Motion") !== -1)) {
                        mgt = comp;
                        break;
                    }
                }
            }

            var isMogrt = (mgt !== null);
            var propsList = [];
            if (mgt && mgt.properties) {
                for (var p = 0; p < mgt.properties.numItems; p++) {
                    var prop = mgt.properties[p];
                    var val = "";
                    try { val = prop.getValue(); } catch(e){}
                    propsList.push({
                        displayName: prop.displayName,
                        value: val
                    });
                }
            } else if (clip.components) {
                var textIdx = 0;
                for (var c = 0; c < clip.components.numItems; c++) {
                    var comp = clip.components[c];
                    if (comp.matchName === "AE.ADBE Text" && comp.properties && comp.properties.numItems > 0) {
                        isMogrt = true;
                        propsList.push({
                            displayName: "Linha " + (textIdx + 1),
                            value: ""
                        });
                        textIdx++;
                    }
                }
            }

            return JSON.stringify({
                hasSeq: true,
                hasSelection: true,
                isMogrt: isMogrt,
                clipName: clip.name,
                start: clip.start ? clip.start.seconds : 0,
                end: clip.end ? clip.end.seconds : 0,
                duration: clip.duration ? clip.duration.seconds : 0,
                properties: propsList
            });
        } catch(e) {
            return JSON.stringify({ hasSeq: false, error: e.toString() });
        }
    },

    updateSelectedMogrtParams: function(jsonPayload) {
        try {
            var data = (typeof jsonPayload === "string") ? JSON.parse(jsonPayload) : (jsonPayload || {});
            if (typeof data === "string") { try { data = JSON.parse(data); } catch(e){} }
            var seq = app.project ? app.project.activeSequence : null;
            if (!seq) return JSON.stringify({ success: false, error: "Nenhuma sequencia ativa." });

            var clip = null;
            var sel = seq.getSelection();
            if (sel && sel.length > 0) clip = sel[0];

            if (!clip && seq.videoTracks) {
                var curSec = seq.getPlayerPosition().seconds;
                for (var t = seq.videoTracks.numTracks - 1; t >= 0; t--) {
                    var tr = seq.videoTracks[t];
                    for (var c = 0; c < tr.clips.numItems; c++) {
                        var cl = tr.clips[c];
                        if (cl.start && cl.end && curSec >= cl.start.seconds && curSec < cl.end.seconds) {
                            clip = cl;
                            break;
                        }
                    }
                    if (clip) break;
                }
            }

            if (!clip) return JSON.stringify({ success: false, error: "Nenhum clipe ativo selecionado." });

            var mgt = null;
            if (clip.getMGTComponent) {
                try { mgt = clip.getMGTComponent(); } catch(e){}
            }
            if (!mgt && clip.components) {
                for (var c = 0; c < clip.components.numItems; c++) {
                    var comp = clip.components[c];
                    if (comp.matchName === "AE.ADBE Motion Graphic" || comp.displayName === "Graphic" || comp.displayName === "Motion Graphics Template" || (comp.properties && comp.properties.numItems > 0 && comp.displayName.indexOf("Motion") !== -1)) {
                        mgt = comp;
                        break;
                    }
                }
            }

            var hasPrText = false;
            if (clip.components) {
                for (var c = 0; c < clip.components.numItems; c++) {
                    if (clip.components[c].matchName === "AE.ADBE Text") {
                        hasPrText = true;
                        break;
                    }
                }
            }

            if ((!mgt || !mgt.properties) && !hasPrText) {
                return JSON.stringify({ success: false, error: "O clipe ativo nao e um .mogrt editavel." });
            }

            var params = data.params || {};
            var updated = [];

            var textValues = [];
            var l1 = params.line1 || params.t1 || params.serif || params.w1 || params.top || params.title;
            var l2 = params.line2 || params.t2 || params.script || params.w2 || params.slam || params.sub;

            if (l1 && l2) {
                textValues.push(l1);
                textValues.push(l2);
            } else if (l1) {
                textValues.push(l1);
                if (params.text && params.text !== l1) textValues.push(params.text);
            } else if (l2) {
                if (params.text && params.text !== l2) textValues.push(params.text);
                textValues.push(l2);
            } else if (params.text) {
                textValues.push(params.text);
            }

            if (mgt && mgt.properties) {
                var textPropIndex = 0;
                for (var p = 0; p < mgt.properties.numItems; p++) {
                    var prop = mgt.properties[p];
                    if (params[prop.displayName] !== undefined) {
                        try {
                            prop.setValue(String(params[prop.displayName]), true);
                            updated.push(prop.displayName);
                        } catch(e){}
                    } else if (textPropIndex < textValues.length) {
                        try {
                            prop.setValue(String(textValues[textPropIndex]), true);
                            updated.push(prop.displayName);
                            textPropIndex++;
                        } catch(e){}
                    }
                }
            }

            // Support for native Premiere Pro Essential Graphics (.prgraphic) components
            if (clip.components) {
                var textCompIndex = 0;
                for (var c = 0; c < clip.components.numItems; c++) {
                    var comp = clip.components[c];
                    if (comp.matchName === "AE.ADBE Text" && comp.properties && comp.properties.numItems > 0) {
                        var srcProp = comp.properties[0];
                        if (srcProp && textCompIndex < textValues.length) {
                            try {
                                srcProp.setValue(String(textValues[textCompIndex]), true);
                                updated.push(comp.displayName + " [" + textCompIndex + "]");
                                textCompIndex++;
                            } catch(e){}
                        }
                    } else if (comp.matchName === "AE.ADBE Shape" || comp.displayName === "Forma" || comp.displayName === "Shape") {
                        if (comp.properties) {
                            for (var p = 0; p < comp.properties.numItems; p++) {
                                var propName = comp.properties[p].displayName;
                                if (propName === "Opacidade" || propName === "Opacity") {
                                    try { comp.properties[p].setValue(0, true); } catch(e){}
                                }
                            }
                        }
                    }
                }
            }

            return JSON.stringify({
                success: true,
                updatedProperties: updated,
                clipName: clip.name
            });
        } catch(e) {
            return JSON.stringify({ success: false, error: e.toString() });
        }
    },

    insertMogrtSequence: function(jsonPayload) {
        try {
            var data = (typeof jsonPayload === "string") ? JSON.parse(jsonPayload) : (jsonPayload || {});
            var seq = app.project ? app.project.activeSequence : null;
            if (!seq) return JSON.stringify({ success: false, error: "Nenhuma sequencia ativa no Premiere Pro." });

            var mogrtPath = data.mogrtPath || "";
            var f = new File(mogrtPath);
            if (!f.exists) {
                return JSON.stringify({ success: false, error: "Arquivo .mogrt nao encontrado: " + mogrtPath });
            }

            var phrases = data.phrases || [];
            if (!phrases.length) {
                return JSON.stringify({ success: false, error: "Nenhuma frase fornecida para a sequencia." });
            }

            var durPerPhrase = Number(data.durationPerPhrase || 2.0);
            var vTrack = (data.videoTrackOffset !== undefined && data.videoTrackOffset !== null) ? Number(data.videoTrackOffset) : 1;
            var startSec = (data.startSeconds !== undefined && data.startSeconds !== null) ? Number(data.startSeconds) : seq.getPlayerPosition().seconds;

            var inserted = [];

            for (var i = 0; i < phrases.length; i++) {
                var phraseText = phrases[i];
                var currentInsertTime = new Time();
                currentInsertTime.seconds = startSec + (i * durPerPhrase);

                var clip = seq.importMGT(f.fsName, currentInsertTime.ticks, vTrack, 0);
                if (clip) {
                    try {
                        var endT = new Time();
                        endT.seconds = currentInsertTime.seconds + durPerPhrase;
                        clip.end = endT;
                    } catch(e){}

                    try { clip.name = "Cherry Caption " + (i + 1); } catch(e){}

                    var mgt = null;
                    if (clip.getMGTComponent) {
                        try { mgt = clip.getMGTComponent(); } catch(e){}
                    }
                    if (mgt && mgt.properties && mgt.properties.numItems > 0) {
                        try {
                            mgt.properties[0].setValue(String(phraseText), true);
                        } catch(e){}
                    }

                    inserted.push({
                        index: i,
                        text: phraseText,
                        start: currentInsertTime.seconds,
                        duration: durPerPhrase
                    });
                }
            }

            app.project.save();

            return JSON.stringify({
                success: true,
                totalInserted: inserted.length,
                sequence: inserted
            });
        } catch(e) {
            return JSON.stringify({ success: false, error: e.toString() });
        }
    }
};
