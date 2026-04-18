(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};
  var utils = StreamBox.utils;

  function toText(value) {
    return utils.safeText(value || '');
  }

  function subtitleLabel(track, index) {
    return toText(track && (track.label || track.title || track.language)) || ('Subtitle ' + (index + 1));
  }

  function normalizeUploadedSubtitle(name, url, type) {
    var cleanName = toText(name) || 'External subtitle';
    var cleanType = toText(type).toLowerCase() || 'text/vtt';
    var language = 'und';
    return {
      label: cleanName,
      language: language,
      type: cleanType,
      url: toText(url),
      source: 'local'
    };
  }

  function buildSubtitleOptions(stream, uploaded) {
    var list = [];
    var source = [];
    var rawSubtitles = Array.isArray(stream && stream.subtitles) ? stream.subtitles : [];
    var localSubtitles = Array.isArray(uploaded) ? uploaded : [];
    var i;

    for (i = 0; i < rawSubtitles.length; i += 1) {
      source.push({
        label: subtitleLabel(rawSubtitles[i], i),
        language: toText(rawSubtitles[i] && rawSubtitles[i].language).toLowerCase() || 'und',
        type: toText(rawSubtitles[i] && rawSubtitles[i].type).toLowerCase() || 'text/vtt',
        url: toText(rawSubtitles[i] && (rawSubtitles[i].url || rawSubtitles[i].uri)),
        source: 'provider'
      });
    }

    for (i = 0; i < localSubtitles.length; i += 1) {
      if (!localSubtitles[i] || !localSubtitles[i].url) continue;
      source.push(localSubtitles[i]);
    }

    list.push({
      id: 'off',
      label: 'Disattivati',
      index: -1,
      source: 'none'
    });

    for (i = 0; i < source.length; i += 1) {
      list.push({
        id: source[i].source + '-' + i,
        label: source[i].label + (source[i].source === 'local' ? ' (file)' : ''),
        index: i,
        source: source[i].source,
        track: source[i]
      });
    }
    return list;
  }

  function parseSrtToVtt(srt) {
    var source = String(srt || '').replace(/\r+/g, '');
    var blocks = source.split('\n\n');
    var out = ['WEBVTT', ''];
    for (var i = 0; i < blocks.length; i += 1) {
      var lines = blocks[i].split('\n');
      if (!lines.length) continue;
      var cursor = 0;
      if (/^\d+$/.test(lines[0].trim())) cursor = 1;
      if (!lines[cursor]) continue;
      var time = lines[cursor].replace(/,/g, '.');
      if (time.indexOf('-->') === -1) continue;
      out.push(time);
      for (var j = cursor + 1; j < lines.length; j += 1) out.push(lines[j]);
      out.push('');
    }
    return out.join('\n');
  }

  function toVttBlobUrl(file, done, fail) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var text = String(reader.result || '');
        var lowerName = toText(file && file.name).toLowerCase();
        var lowerType = toText(file && file.type).toLowerCase();
        var vtt = text;
        if (lowerName.indexOf('.srt') >= 0 || lowerType.indexOf('subrip') >= 0) {
          vtt = parseSrtToVtt(text);
        }
        var blob = new Blob([vtt], { type: 'text/vtt' });
        done(global.URL.createObjectURL(blob));
      } catch (error) {
        fail(error);
      }
    };
    reader.onerror = function () {
      fail(new Error('File read failed'));
    };
    reader.readAsText(file);
  }

  function qualityLabel(item) {
    if (!item) return 'Auto';
    if (item.auto) return 'Auto';
    if (item.height) return item.height + 'p';
    if (item.bitrate) return Math.round(item.bitrate / 1000) + 'kbps';
    return toText(item.label || item.name || 'Quality');
  }

  StreamBox.playerTracks = {
    normalizeUploadedSubtitle: normalizeUploadedSubtitle,
    buildSubtitleOptions: buildSubtitleOptions,
    toVttBlobUrl: toVttBlobUrl,
    qualityLabel: qualityLabel
  };
})(window);
