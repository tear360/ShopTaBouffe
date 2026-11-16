package com.shoptabouffe.app.ui.screens.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.shoptabouffe.app.core.Session
import com.shoptabouffe.app.core.models.Message
import com.shoptabouffe.app.core.toShortDateTime
import com.shoptabouffe.app.ui.components.Avatar
import com.shoptabouffe.app.ui.components.ShopTaBouffeTopBar
import com.shoptabouffe.app.ui.components.ErrorState
import com.shoptabouffe.app.ui.components.LoadingBox

@Composable
fun ChatScreen(
    conversationId: Long,
    isSupplier: Boolean,
    onBack: () -> Unit,
) {
    val vm: ChatViewModel = viewModel()
    LaunchedEffect(conversationId) { vm.open(conversationId) }

    val state by vm.state.collectAsStateWithLifecycle()
    val myId = Session.current?.user?.value?.id ?: 0L

    val listState = rememberLazyListState()
    var draft by rememberSaveable(conversationId) { mutableStateOf("") }

    val customerName = state.conversation?.customer?.name
    val title = if (isSupplier) {
        customerName?.ifBlank { "Client" } ?: "Client"
    } else {
        "Fournisseur"
    }

    LaunchedEffect(state.messages.size) {
        if (state.messages.isNotEmpty()) listState.animateScrollToItem(0)
    }

    Column(modifier = Modifier.fillMaxSize()) {
        ShopTaBouffeTopBar(
            title = title,
            subtitle = if (state.conversation != null) "Conversation" else null,
            navigation = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Retour")
                }
            },
            actions = {
                if (state.conversation?.customer != null) {
                    Box(modifier = Modifier.padding(end = 12.dp)) {
                        Avatar(state.conversation?.customer?.avatarUrl, 36.dp)
                    }
                }
            },
        )

        when {
            state.loading && state.messages.isEmpty() -> LoadingBox("Ouverture de la conversation…")

            state.error != null && state.messages.isEmpty() -> ErrorState(
                message = state.error ?: "Erreur",
                onRetry = { vm.load() },
            )

            else -> LazyColumn(
                state = listState,
                reverseLayout = true,
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
            ) {
                items(
                    count = state.messages.size,
                    key = { index -> state.messages[state.messages.lastIndex - index].id },
                ) { index ->
                    val message = state.messages[state.messages.lastIndex - index]
                    MessageBubble(
                        message = message,
                        mine = message.senderId == myId,
                        showSender = !isSupplier && message.senderId != myId,
                    )
                }
            }
        }

        state.error?.let {
            if (state.messages.isNotEmpty()) {
                Text(
                    it,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center,
                )
            }
        }

        Surface(shadowElevation = 8.dp, color = MaterialTheme.colorScheme.surface) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .imePadding()
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it.take(1000) },
                    placeholder = { Text("Votre message…") },
                    maxLines = 4,
                    shape = RoundedCornerShape(20.dp),
                    keyboardOptions = KeyboardOptions(
                        capitalization = KeyboardCapitalization.Sentences,
                        imeAction = ImeAction.Send,
                    ),
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(8.dp))
                IconButton(
                    onClick = {
                        val text = draft
                        draft = ""
                        vm.send(text)
                    },
                    enabled = draft.isNotBlank() && !state.sending,
                ) {
                    Box(
                        modifier = Modifier
                            .size(42.dp)
                            .background(
                                if (draft.isNotBlank()) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.surfaceVariant,
                                RoundedCornerShape(50)
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.AutoMirrored.Filled.Send,
                            contentDescription = "Envoyer",
                            tint = if (draft.isNotBlank()) MaterialTheme.colorScheme.onPrimary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MessageBubble(message: Message, mine: Boolean, showSender: Boolean) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start,
    ) {
        Surface(
            color = if (mine) MaterialTheme.colorScheme.primaryContainer
            else MaterialTheme.colorScheme.surface,
            shape = RoundedCornerShape(
                topStart = 18.dp,
                topEnd = 18.dp,
                bottomStart = if (mine) 18.dp else 4.dp,
                bottomEnd = if (mine) 4.dp else 18.dp,
            ),
            shadowElevation = 1.dp,
            modifier = Modifier.widthIn(max = 300.dp),
        ) {
            Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 9.dp)) {
                if (showSender && !message.senderName.isNullOrBlank()) {
                    Text(
                        message.senderName,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
                Text(
                    message.body,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (mine) MaterialTheme.colorScheme.onPrimaryContainer
                    else MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    message.createdAt.toShortDateTime(),
                    style = MaterialTheme.typography.labelSmall,
                    color = (if (mine) MaterialTheme.colorScheme.onPrimaryContainer
                    else MaterialTheme.colorScheme.onSurfaceVariant).copy(alpha = 0.7f),
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.End,
                )
            }
        }
    }
}
