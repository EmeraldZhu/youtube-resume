'use strict';

/**
 * Builds the minimal `#movie_player` / `.ytp-time-display` / `.ytp-chrome-bottom`
 * structure playerObserver/uiInjector query for, and attaches it under
 * document.body.
 */
function buildPlayerDom(document, { withVideo } = {}) {
  const moviePlayer = document.createElement('div');
  moviePlayer.setAttribute('id', 'movie_player');
  moviePlayer.id = 'movie_player';

  const chromeBottom = document.createElement('div');
  chromeBottom.className = 'ytp-chrome-bottom';
  chromeBottom.getBoundingClientRect = () => ({ height: 59 });

  const timeDisplay = document.createElement('span');
  timeDisplay.className = 'ytp-time-display';

  chromeBottom.appendChild(timeDisplay);
  moviePlayer.appendChild(chromeBottom);

  if (withVideo) {
    moviePlayer.appendChild(withVideo);
  }

  document.body.appendChild(moviePlayer);
  return { moviePlayer, chromeBottom, timeDisplay };
}

function setAdPlaying(moviePlayer, isPlaying) {
  moviePlayer.classList.toggle('ad-showing', !!isPlaying);
}

module.exports = { buildPlayerDom, setAdPlaying };
