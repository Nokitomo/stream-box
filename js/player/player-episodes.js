(function (global) {
  var StreamBox = global.StreamBox = global.StreamBox || {};

  function createNavigator(payload, seasonIndex, episodeIndex) {
    var currentSeason = Math.max(0, Number(seasonIndex) || 0);
    var currentEpisode = Math.max(0, Number(episodeIndex) || 0);

    function clamp() {
      var seasons = payload && payload.seasons ? payload.seasons : [];
      if (!seasons.length) {
        currentSeason = 0;
        currentEpisode = 0;
        return;
      }
      if (currentSeason >= seasons.length) currentSeason = seasons.length - 1;
      if (currentSeason < 0) currentSeason = 0;
      var episodes = seasons[currentSeason].episodes || [];
      if (!episodes.length) {
        currentEpisode = 0;
        return;
      }
      if (currentEpisode >= episodes.length) currentEpisode = episodes.length - 1;
      if (currentEpisode < 0) currentEpisode = 0;
    }

    function getCurrentSeason() {
      clamp();
      return payload.seasons[currentSeason];
    }

    function getCurrentEpisode() {
      clamp();
      var season = getCurrentSeason();
      return season && season.episodes ? season.episodes[currentEpisode] : null;
    }

    function setIndexes(season, episode) {
      currentSeason = Number(season) || 0;
      currentEpisode = Number(episode) || 0;
      clamp();
      return {
        seasonIndex: currentSeason,
        episodeIndex: currentEpisode,
        season: getCurrentSeason(),
        episode: getCurrentEpisode()
      };
    }

    function hasNextEpisode() {
      clamp();
      var season = getCurrentSeason();
      if (!season || !Array.isArray(season.episodes)) return false;
      if (currentEpisode < season.episodes.length - 1) return true;
      return currentSeason < payload.seasons.length - 1;
    }

    function goNextEpisode() {
      clamp();
      var season = getCurrentSeason();
      if (season && currentEpisode < season.episodes.length - 1) {
        currentEpisode += 1;
        return true;
      }
      if (currentSeason < payload.seasons.length - 1) {
        currentSeason += 1;
        currentEpisode = 0;
        clamp();
        return true;
      }
      return false;
    }

    function toState() {
      clamp();
      return {
        seasonIndex: currentSeason,
        episodeIndex: currentEpisode
      };
    }

    clamp();

    return {
      getCurrentSeason: getCurrentSeason,
      getCurrentEpisode: getCurrentEpisode,
      setIndexes: setIndexes,
      hasNextEpisode: hasNextEpisode,
      goNextEpisode: goNextEpisode,
      toState: toState
    };
  }

  StreamBox.playerEpisodes = {
    createNavigator: createNavigator
  };
})(window);
