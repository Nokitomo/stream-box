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
        seasonId: toText(detail.loadedSeason.id || ''),
        seasonNumber: toInt(detail.loadedSeason.number, 1),
        title: 'Season ' + toInt(detail.loadedSeason.number, 1),
        episodesCount: episodes.length,
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
          seasonId: '',
          seasonNumber: 1,
          title: 'Season 1',
          episodesCount: 1,
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
        infoUrl: detail && detail.links ? detail.links.page : summary.sourceLink,
        type: summary.type || detail.type || 'series'
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

  function isProviderSupported(provider) {
    var normalized = toText(provider).toLowerCase();
    return normalized === 'animeunity' || normalized === 'streamingunity';
  }

  function resolveProviderLink(summary, detail) {
    var byDetail = detail && detail.links ? toText(detail.links.page || detail.links.source || detail.links.watch) : '';
    if (byDetail) return byDetail;
    return toText(summary && summary.sourceLink);
  }

  function toQuery(params) {
    var out = [];
    var key;
    for (key in params) {
      if (!Object.prototype.hasOwnProperty.call(params, key)) continue;
      var value = toText(params[key]);
      if (!value) continue;
      out.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    }
    return out.join('&');
  }

  function requestApiJson(path, params) {
    var query = toQuery(params || {});
    var url = utils.resolvePath(path + (query ? ('?' + query) : ''));
    return data.requestJson(url);
  }

  function fromApi(summary, detail) {
    var provider = toText(summary && summary.provider).toLowerCase();
    var link = resolveProviderLink(summary, detail);
    if (!isProviderSupported(provider) || !link) {
      return Promise.reject(new Error('Provider link/API non disponibile'));
    }

    return requestApiJson('/api/player/payload', {
      provider: provider,
      link: link,
      contentId: summary && summary.id,
      title: summary && summary.title,
      poster: summary && summary.poster,
      backdrop: summary && summary.backdrop,
      infoUrl: detail && detail.links ? detail.links.page : ''
    }).then(function (response) {
      if (!response || response.ok !== true || !response.payload) {
        throw new Error((response && response.error) || 'Payload API non valido');
      }
      return response.payload;
    });
  }

  function normalizeEpisodes(rawEpisodes, seasonIndex) {
    var source = Array.isArray(rawEpisodes) ? rawEpisodes : [];
    var out = [];
    for (var i = 0; i < source.length; i += 1) {
      var normalized = contract.normalizeEpisode ? contract.normalizeEpisode(source[i], seasonIndex, i) : source[i];
      if (normalized) out.push(normalized);
    }
    return out;
  }

  function resolvePayload(summary, detail, query) {
    var useMock = String(query && query.mock || '') === '1';
    var rawPromise = null;

    if (useMock) rawPromise = fromMock(summary, detail);
    else if (isProviderSupported(summary && summary.provider) && resolveProviderLink(summary, detail)) rawPromise = fromApi(summary, detail).catch(function () {
      return fromProvider(summary, detail);
    });
    else rawPromise = Promise.resolve(fromProvider(summary, detail));

    return rawPromise.then(function (raw) {
      return {
        payload: contract.normalizePayload(raw, { summary: summary, detail: detail, query: query }),
        links: {
          titlePage: makeTitleLink(summary),
          providerWatch: detail && detail.links ? toText(detail.links.watch || detail.links.source || detail.links.page) : toText(summary.sourceLink)
        }
      };
    });
  }

  function loadSeasonEpisodes(payload, seasonIndex, links) {
    var safeSeason = toInt(seasonIndex, 0);
    var season = payload && payload.seasons && payload.seasons[safeSeason];
    if (!season) return Promise.resolve([]);
    if (Array.isArray(season.episodes) && season.episodes.length) return Promise.resolve(season.episodes);

    var provider = toText(payload && payload.content && payload.content.provider).toLowerCase();
    if (!isProviderSupported(provider)) return Promise.resolve([]);

    var seasonLink = toText(season.episodesLink || '');
    var contentLink = toText(payload && payload.content && payload.content.infoUrl || '') || toText(links && links.providerWatch || '');
    if (!seasonLink && !contentLink) return Promise.resolve([]);

    return requestApiJson('/api/player/episodes', {
      provider: provider,
      seasonLink: seasonLink,
      contentLink: contentLink
    }).then(function (response) {
      if (!response || response.ok !== true || !Array.isArray(response.episodes)) return [];
      var normalized = normalizeEpisodes(response.episodes, safeSeason);
      season.episodes = normalized;
      if (!season.episodesCount || season.episodesCount < normalized.length) {
        season.episodesCount = normalized.length;
      }
      return normalized;
    }, function () {
      return [];
    });
  }

  function normalizeStreams(rawStreams) {
    var source = Array.isArray(rawStreams) ? rawStreams : [];
    var out = [];
    for (var i = 0; i < source.length; i += 1) {
      var normalized = contract.normalizeStream ? contract.normalizeStream(source[i], i) : source[i];
      if (normalized) out.push(normalized);
    }
    return out;
  }

  function refreshStreams(payload, seasonIndex, episodeIndex) {
    var safeSeason = toInt(seasonIndex, 0);
    var safeEpisode = toInt(episodeIndex, 0);
    var season = payload && payload.seasons && payload.seasons[safeSeason];
    var episode = season && season.episodes && season.episodes[safeEpisode];
    var existing = episode && Array.isArray(episode.streams) ? episode.streams : [];

    var provider = toText(payload && payload.content && payload.content.provider).toLowerCase();
    if (!episode || !episode.link || !isProviderSupported(provider)) return Promise.resolve(existing);

    return requestApiJson('/api/player/streams', {
      provider: provider,
      link: episode.link
    }).then(function (response) {
      if (!response || response.ok !== true || !Array.isArray(response.streams)) {
        return existing;
      }
      var normalized = normalizeStreams(response.streams);
      return normalized.length ? normalized : existing;
    }, function () {
      return existing;
    });
  }

  StreamBox.playerAdapter = {
    resolvePayload: resolvePayload,
    loadSeasonEpisodes: loadSeasonEpisodes,
    refreshStreams: refreshStreams
  };
})(window);