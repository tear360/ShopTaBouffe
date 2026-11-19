package com.shoptabouffe.app.ui.screens.finances

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.shoptabouffe.app.core.Api
import com.shoptabouffe.app.core.ApiResult
import com.shoptabouffe.app.core.models.CreateExpenseBody
import com.shoptabouffe.app.core.models.Expense
import com.shoptabouffe.app.core.models.FinanceProduct
import com.shoptabouffe.app.core.models.FinanceSummary
import com.shoptabouffe.app.core.models.Sale
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class FinancesState(
    val loading: Boolean = true,
    val error: String? = null,
    val summary: FinanceSummary? = null,
    val sales: List<Sale> = emptyList(),
    val products: List<FinanceProduct> = emptyList(),
    val expenses: List<Expense> = emptyList(),
    /** Période AAAA-MM-JJ ; null = tout. */
    val from: String? = null,
    val to: String? = null,
    val busy: Boolean = false,
    val notice: String? = null,
)

/**
 * Espace Finances du fournisseur : revenus, coûts, marges, ventes livrées
 * (journal qui survit à la purge de 2 h) et dépenses.
 */
class FinancesViewModel(app: Application) : AndroidViewModel(app) {
    private val _state = MutableStateFlow(FinancesState())
    val state: StateFlow<FinancesState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val s = _state.value
            val summary = Api.call { Api.service.financeSummary(s.from, s.to) }
            val sales = Api.call { Api.service.financeSales(s.from, s.to, limit = 50) }
            val products = Api.call { Api.service.financeProducts(s.from, s.to) }
            val expenses = Api.call { Api.service.expenses() }

            val failure = listOf(summary, sales, products, expenses)
                .filterIsInstance<ApiResult.Failure>()
                .firstOrNull()

            if (failure != null) {
                _state.update { it.copy(loading = false, error = failure.message) }
                return@launch
            }

            _state.update {
                it.copy(
                    loading = false,
                    error = null,
                    summary = (summary as ApiResult.Success).data,
                    sales = (sales as ApiResult.Success).data.sales ?: emptyList(),
                    products = (products as ApiResult.Success).data.products ?: emptyList(),
                    expenses = (expenses as ApiResult.Success).data.expenses ?: emptyList(),
                )
            }
        }
    }

    /** Applique une période (AAAA-MM-JJ) puis recharge. null = tout. */
    fun setPeriod(from: String?, to: String?) {
        _state.update { it.copy(from = from?.ifBlank { null }, to = to?.ifBlank { null }) }
        load()
    }

    fun clearPeriod() = setPeriod(null, null)

    fun addExpense(label: String, amountCents: Int, date: String?) {
        if (label.isBlank() || amountCents <= 0) return
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            when (val result = Api.call {
                Api.service.createExpense(
                    CreateExpenseBody(label = label.trim(), amountCents = amountCents, date = date),
                )
            }) {
                is ApiResult.Success -> {
                    _state.update { it.copy(busy = false, notice = "Dépense ajoutée.") }
                    load()
                }

                is ApiResult.Failure -> _state.update {
                    it.copy(busy = false, notice = result.message)
                }
            }
        }
    }

    fun deleteExpense(expense: Expense) {
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            when (val result = Api.call { Api.service.deleteExpense(expense.id) }) {
                is ApiResult.Success -> {
                    _state.update { it.copy(busy = false, notice = "Dépense supprimée.") }
                    load()
                }

                is ApiResult.Failure -> _state.update {
                    it.copy(busy = false, notice = result.message)
                }
            }
        }
    }

    fun consumeNotice() = _state.update { it.copy(notice = null) }
}
