(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};
  var utils = StreamBox.utils;
  var data = StreamBox.data;
  var contract = StreamBox.playerContract;

  function toText(value) {
    return utils.safeText(value || '');
  }

  function toInt(value, fallback) {
    var parsed = Number(value);
    return isFinite(parsed) ? Math.floor(parsed) : fallback;
  }

  function makeTitleLink(summary) {
    return utils.resolvePath('html/title.html') +
      '?id=' + encodeURIComponent(summary.id) +
      '&provider=' + encodeURIComponent(summary.provider || '');
  }

  function mapLoadedSeason(detail) {
    if (!detail || !detail.loadedSeason || !Array.isArray(detail.loadedSeason.episodes)) return [];
    var episodes = [];
    for (var i = 0; i < detail.loadedSeason.episodes.length; i += 1) {
      var raw = detail.loadedSeason.episodes[i] || {};
      episodes.push({
        episodeId: toText(raw.id || ('loaded-' + i)),
        title: toText(raw.name) || ('Episode ' + (i + 1)),
        episodeNumber: toInt(raw.number, i + 1),
        link: 'loaded-' + (i + 1),
        streams: []
      });
    }
    return [
      {
        seasonNumber: toInt(detail.loadedSeason.number, 1),
        title: 'Season ' + toInt(detail.loadedSeason.number, 1),
        episodes: episodes
      }
    ];
  }

  function fromProvider(summary, detail) {
    if (detail && detail.playerPayload && typeof detail.playerPayload === 'object') {
      return detail.playerPayload;
    }
    var directStreams = Array.isArray(detail && detail.streams) ? detail.streams : [];
    var seasons = mapLoadedSeason(detail);
    if (!seasons.length) {
      seasons = [
        {
          seasonNumber: 1,
          title: 'Season 1',
          episodes: [
            {
              episodeId: summary.id + '-default',
              title: summary.title,
              episodeNumber: 1,
              link: toText(summary.sourceLink) || ('content-' + summary.id),
              streams: directStreams
            }
          ]
        }
      ];
    }
    return {
      content: {
        id: summary.id,
        provider: summary.provider,
        title: summary.title,
        poster: summary.poster,
        backdrop: summary.backdrop,
        infoUrl: detail && detail.links ? detail.links.page : summary.sourceLink
      },
      seasons: seasons,
      defaults: {
        seasonIndex: 0,
        episodeIndex: 0,
        streamIndex: 0,
        autoplay: true
      }
    };
  }

  function loadMockMap() {
    return data.requestJson(utils.resolvePath('data/mocks/player/streams-by-id.json')).then(function (payload) {
      if (!payload || !Array.isArray(payload.items)) return [];
      return payload.items;
    });
  }

  function fromMock(summary, detail) {
    return loadMockMap().then(function (items) {
      var fallback = null;
      var providerMatch = null;
      var providerId = String(summary.provider || '') + ':' + String(summary.id || '');
      for (var i = 0; i < items.length; i += 1) {
        var item = items[i] || {};
        if (toText(item.id) === toText(summary.id)) fallback = item.payload || null;
        if (toText(item.providerId) === toText(providerId)) providerMatch = item.payload || null;
      }
      return providerMatch || fallback || fromProvider(summary, detail);
    });
  }

  function resolvePayload(summary, detail, query) {
    var useMock = String(query && query.mock || '') === '1';
    var rawPromise = useMock ? fromMock(summary, detail) : Promise.resolve(fromProvider(summary, detail));
    return rawPromise.then(function (raw) {
      return {
        payload: contract.normalizePayload(raw, { summary: summary, detail: detail, query: query }),
        links: {
          titlePage: makeTitleLink(summary),
          providerWatch: detail && detail.links ? toText(detail.links.watch || detail.links.source) : toText(summary.sourceLink)
        }
      };
    });
  }

  function refreshStreams(payload, seasonIndex, episodeIndex) {
    var safeSeason = toInt(seasonIndex, 0);
    var safeEpisode = toInt(episodeIndex, 0);
    var season = payload && payload.seasons && payload.seasons[safeSeason];
    var episode = season && season.episodes && season.episodes[safeEpisode];
    return Promise.resolve(episode && episode.streams ? episode.streams : []);
  }

  StreamBox.playerAdapter = {
    resolvePayload: resolvePayload,
    refreshStreams: refreshStreams
  };
})(window);
