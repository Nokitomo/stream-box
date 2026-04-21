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

  function extractTitleIdFromLink(link) {
    var source = toText(link);
    if (!source) return '';
    var match = source.match(/\/(?:titles|watch|iframe)\/(\d+)/i);
    if (match && match[1]) return match[1];
    return '';
  }

  function buildStreamingunitySeasonLink(basePageLink, seasonNumber) {
    var base = toText(basePageLink);
    var number = Number(seasonNumber);
    if (!base || !isFinite(number) || number <= 0) return '';
    if (!/\/titles\//i.test(base)) return '';
    var clean = base.split('?')[0].split('#')[0].replace(/\/+$/, '');
    clean = clean.replace(/\/season-\d+$/i, '');
    return clean + '/season-' + Math.floor(number);
  }

  function buildEpisodeLink(summary, detail, rawEpisode, index) {
    var episode = rawEpisode || {};
    var provider = toText(summary && summary.provider).toLowerCase();
    var rawLink = toText(episode.link || episode.episodeLink || episode.url || episode.src);
    if (rawLink) return rawLink;

    var episodeId = toText(episode.id || episode.episodeId);
    if (!episodeId) return 'loaded-' + (index + 1);

    if (provider === 'streamingunity') {
      var baseLink = toText(detail && detail.links && (detail.links.page || detail.links.watch || detail.links.source)) || toText(summary && summary.sourceLink);
      var titleId = extractTitleIdFromLink(baseLink);
      if (titleId) return titleId + '::' + episodeId;
      return episodeId;
    }
    return episodeId;
  }

  function mapDetailSeasons(summary, detail) {
    var source = detail && Array.isArray(detail.seasons) ? detail.seasons : [];
    if (!source.length) return [];

    var out = [];
    var provider = toText(summary && summary.provider).toLowerCase();
    var pageLink = toText(detail && detail.links && detail.links.page);

    for (var i = 0; i < source.length; i += 1) {
      var rawSeason = source[i] || {};
      var number = toInt(rawSeason.seasonNumber || rawSeason.number, i + 1);
      var episodesLink =
        toText(rawSeason.episodesLink || rawSeason.link || rawSeason.episodes_url) ||
        (provider === 'streamingunity' ? buildStreamingunitySeasonLink(pageLink, number) : '');

      var rawEpisodes = Array.isArray(rawSeason.episodes) ? rawSeason.episodes : [];
      var episodes = [];
      for (var j = 0; j < rawEpisodes.length; j += 1) {
        var episode = rawEpisodes[j] || {};
        episodes.push({
          episodeId: toText(episode.id || episode.episodeId || ('season-' + number + '-ep-' + (j + 1))),
          title: toText(episode.title || episode.name) || ('Episode ' + (j + 1)),
          episodeNumber: toInt(episode.episodeNumber || episode.number, j + 1),
          link: buildEpisodeLink(summary, detail, episode, j),
          streams: Array.isArray(episode.streams) ? episode.streams : []
        });
      }

      if (!episodes.length && !episodesLink) continue;
      out.push({
        seasonId: toText(rawSeason.id || rawSeason.seasonId || ''),
        seasonNumber: number,
        title: toText(rawSeason.title || rawSeason.name) || ('Season ' + number),
        episodesCount: toInt(rawSeason.episodesCount || rawSeason.episodes_count, episodes.length),
        episodesLink: episodesLink,
        episodes: episodes
      });
    }

    return out;
  }

  function mapLoadedSeason(summary, detail) {
    if (!detail || !detail.loadedSeason || !Array.isArray(detail.loadedSeason.episodes)) return [];
    var episodes = [];
    for (var i = 0; i < detail.loadedSeason.episodes.length; i += 1) {
      var raw = detail.loadedSeason.episodes[i] || {};
      episodes.push({
        episodeId: toText(raw.id || ('loaded-' + i)),
        title: toText(raw.name) || ('Episode ' + (i + 1)),
        episodeNumber: toInt(raw.number, i + 1),
        link: buildEpisodeLink(summary, detail, raw, i),
        streams: []
      });
    }
    var seasonNumber = toInt(detail.loadedSeason.number, 1);
    var episodesLink = '';
    if (toText(summary && summary.provider).toLowerCase() === 'streamingunity') {
      episodesLink = buildStreamingunitySeasonLink(
        detail && detail.links ? detail.links.page : '',
        seasonNumber
      );
    }
    return [
      {
        seasonId: toText(detail.loadedSeason.id || ''),
        seasonNumber: seasonNumber,
        title: 'Season ' + seasonNumber,
        episodesCount: episodes.length,
        episodesLink: episodesLink,
        episodes: episodes
      }
    ];
  }

  function fromProvider(summary, detail) {
    if (detail && detail.playerPayload && typeof detail.playerPayload === 'object') {
      return detail.playerPayload;
    }
    var directStreams = Array.isArray(detail && detail.streams) ? detail.streams : [];
    var seasons = mapDetailSeasons(summary, detail);
    if (!seasons.length) seasons = mapLoadedSeason(summary, detail);
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
        autoplay: false
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

  function toProxyUrl(rawUrl) {
    var source = toText(rawUrl);
    if (!source) return '';
    if (/\/api\/player\/proxy\?/i.test(source)) return source;
    var params = { url: source };
    return utils.resolvePath('/api/player/proxy') + '?' + toQuery(params);
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
      if (normalized && normalized.url) {
        normalized.url = toProxyUrl(normalized.url);
      }
      if (normalized && Array.isArray(normalized.subtitles)) {
        for (var j = 0; j < normalized.subtitles.length; j += 1) {
          var subtitle = normalized.subtitles[j];
          if (!subtitle || !subtitle.url) continue;
          subtitle.url = toProxyUrl(subtitle.url);
        }
      }
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
