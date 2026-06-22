package com.resenhalocal.nearbytransport

import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Base64
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.AdvertisingOptions
import com.google.android.gms.nearby.connection.ConnectionInfo
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback
import com.google.android.gms.nearby.connection.ConnectionResolution
import com.google.android.gms.nearby.connection.ConnectionsClient
import com.google.android.gms.nearby.connection.ConnectionsStatusCodes
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo
import com.google.android.gms.nearby.connection.DiscoveryOptions
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback
import com.google.android.gms.nearby.connection.Payload
import com.google.android.gms.nearby.connection.PayloadCallback
import com.google.android.gms.nearby.connection.PayloadTransferUpdate
import com.google.android.gms.nearby.connection.Strategy
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

// ID de serviço único do app — só dispositivos anunciando/descobrindo com o
// mesmo SERVICE_ID conseguem se enxergar. Trocar isso quebraria a
// compatibilidade entre versões publicadas do app, então não mude à toa.
private const val SERVICE_ID = "com.resenhalocal.app.SERVICE_ID"

// P2P_CLUSTER permite múltiplas conexões simultâneas em todos os
// dispositivos (necessário para grupos e para a futura rede mesh).
// Strategy.P2P_STAR seria mais eficiente para 1:1, mas limitaria grupos.
private val STRATEGY = Strategy.P2P_CLUSTER

class NearbyTransportModule : Module() {

  private val context: Context
    get() = appContext.reactContext
      ?: throw IllegalStateException("Contexto Android indisponível para o NearbyTransportModule")

  private val connectionsClient: ConnectionsClient by lazy { Nearby.getConnectionsClient(context) }

  // --- Callbacks da Nearby Connections API -------------------------------

  private val connectionLifecycleCallback = object : ConnectionLifecycleCallback() {
    override fun onConnectionInitiated(endpointId: String, info: ConnectionInfo) {
      sendEvent(
        "onConnectionInitiated",
        mapOf(
          "endpointId" to endpointId,
          "endpointName" to info.endpointName,
          "authenticationDigits" to info.authenticationDigits
        )
      )
    }

    override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
      val status = when (result.status.statusCode) {
        ConnectionsStatusCodes.STATUS_OK -> "connected"
        ConnectionsStatusCodes.STATUS_CONNECTION_REJECTED -> "rejected"
        else -> "error"
      }

      if (status == "connected") {
        connectionsClient.acceptConnection(endpointId, payloadCallback)
      }

      sendEvent("onConnectionResult", mapOf("endpointId" to endpointId, "status" to status))
    }

    override fun onDisconnected(endpointId: String) {
      sendEvent("onDisconnected", mapOf("endpointId" to endpointId))
    }
  }

  private val endpointDiscoveryCallback = object : EndpointDiscoveryCallback() {
    override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
      if (info.serviceId != SERVICE_ID) return
      sendEvent("onEndpointFound", mapOf("endpointId" to endpointId, "endpointName" to info.endpointName))
    }

    override fun onEndpointLost(endpointId: String) {
      sendEvent("onEndpointLost", mapOf("endpointId" to endpointId))
    }
  }

  private val payloadCallback = object : PayloadCallback() {
    override fun onPayloadReceived(endpointId: String, payload: Payload) {
      if (payload.type != Payload.Type.BYTES) return
      val bytes = payload.asBytes() ?: return
      val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
      sendEvent("onPayloadReceived", mapOf("endpointId" to endpointId, "payloadBase64" to base64))
    }

    override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) {
      // Reservado para indicador de progresso (envio de mídia, fora do MVP).
    }
  }

  // --- Definição do módulo exposto ao JavaScript --------------------------

  override fun definition() = ModuleDefinition {
    Name("NearbyTransport")

    Events(
      "onEndpointFound",
      "onEndpointLost",
      "onConnectionInitiated",
      "onConnectionResult",
      "onDisconnected",
      "onPayloadReceived"
    )

    AsyncFunction("startAdvertising") { userName: String, promise: Promise ->
      startForegroundServiceIfNeeded()
      val options = AdvertisingOptions.Builder().setStrategy(STRATEGY).build()
      connectionsClient
        .startAdvertising(userName, SERVICE_ID, connectionLifecycleCallback, options)
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { e -> promise.reject("ERR_ADVERTISING", e.message, e) }
    }

    AsyncFunction("stopAdvertising") {
      connectionsClient.stopAdvertising()
    }

    AsyncFunction("startDiscovery") { promise: Promise ->
      startForegroundServiceIfNeeded()
      val options = DiscoveryOptions.Builder().setStrategy(STRATEGY).build()
      connectionsClient
        .startDiscovery(SERVICE_ID, endpointDiscoveryCallback, options)
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { e -> promise.reject("ERR_DISCOVERY", e.message, e) }
    }

    AsyncFunction("stopDiscovery") {
      connectionsClient.stopDiscovery()
    }

    AsyncFunction("requestConnection") { endpointId: String, userName: String, promise: Promise ->
      connectionsClient
        .requestConnection(userName, endpointId, connectionLifecycleCallback)
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { e -> promise.reject("ERR_REQUEST_CONNECTION", e.message, e) }
    }

    AsyncFunction("acceptConnection") { endpointId: String ->
      connectionsClient.acceptConnection(endpointId, payloadCallback)
    }

    AsyncFunction("rejectConnection") { endpointId: String ->
      connectionsClient.rejectConnection(endpointId)
    }

    AsyncFunction("sendPayload") { endpointId: String, payloadBase64: String, promise: Promise ->
      val bytes = Base64.decode(payloadBase64, Base64.NO_WRAP)
      connectionsClient
        .sendPayload(endpointId, Payload.fromBytes(bytes))
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { e -> promise.reject("ERR_SEND_PAYLOAD", e.message, e) }
    }

    AsyncFunction("disconnect") { endpointId: String ->
      connectionsClient.disconnectFromEndpoint(endpointId)
    }

    AsyncFunction("stopAll") {
      connectionsClient.stopAllEndpoints()
      connectionsClient.stopAdvertising()
      connectionsClient.stopDiscovery()
      stopForegroundService()
    }
  }

  // --- Serviço em primeiro plano -------------------------------------------
  // Mantém a descoberta/anúncio funcionando com o app em segundo plano,
  // exibindo uma notificação persistente (exigência do próprio Android).

  private fun startForegroundServiceIfNeeded() {
    val intent = Intent(context, NearbyDiscoveryService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(intent)
    } else {
      context.startService(intent)
    }
  }

  private fun stopForegroundService() {
    context.stopService(Intent(context, NearbyDiscoveryService::class.java))
  }
}
