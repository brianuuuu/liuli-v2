package com.liuli.app.feature.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liuli.app.core.common.UiState
import com.liuli.app.core.common.toUiMessage
import com.liuli.app.core.network.PortfolioOverview
import com.liuli.app.core.network.StockDashboard
import com.liuli.app.core.network.TrackDashboard
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val repository: DashboardRepository,
) : ViewModel() {
    private val _today = MutableStateFlow<UiState<TodayDashboard>>(UiState.Loading)
    val today: StateFlow<UiState<TodayDashboard>> = _today.asStateFlow()
    private val _market = MutableStateFlow<UiState<MarketDashboard>>(UiState.Loading)
    val market: StateFlow<UiState<MarketDashboard>> = _market.asStateFlow()
    private val _track = MutableStateFlow<UiState<TrackDashboard>>(UiState.Loading)
    val track: StateFlow<UiState<TrackDashboard>> = _track.asStateFlow()
    private val _stock = MutableStateFlow<UiState<StockDashboard>>(UiState.Loading)
    val stock: StateFlow<UiState<StockDashboard>> = _stock.asStateFlow()
    private val _portfolio = MutableStateFlow<UiState<Pair<PortfolioOverview, List<Double>>>>(UiState.Loading)
    val portfolio: StateFlow<UiState<Pair<PortfolioOverview, List<Double>>>> = _portfolio.asStateFlow()

    fun load(page: Int, force: Boolean = false) {
        when (page) {
            0 -> loadInto(_today, force) { repository.today(force) }
            1 -> loadInto(_market, force) { repository.market(force) }
            2 -> loadInto(_track, force) { repository.track(force) }
            3 -> loadInto(_stock, force) { repository.stock(force) }
            4 -> loadInto(_portfolio, force) { repository.portfolio(force) }
        }
    }

    private fun <T> loadInto(state: MutableStateFlow<UiState<T>>, force: Boolean, block: suspend () -> T) {
        if (!force && state.value is UiState.Content) return
        val previous = (state.value as? UiState.Content)?.data
        state.value = previous?.let { UiState.Content(it, refreshing = true) } ?: UiState.Loading
        viewModelScope.launch {
            runCatching { block() }
                .onSuccess { state.value = UiState.Content(it) }
                .onFailure {
                    state.value = previous?.let { old -> UiState.Content(old) }
                        ?: UiState.Error(it.toUiMessage("看板加载失败"))
                }
        }
    }
}
