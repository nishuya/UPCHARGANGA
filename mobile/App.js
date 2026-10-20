import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { initialWindowMetrics, SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import LoadingScreen from './src/screens/LoadingScreen';
import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import AppointmentsScreen from './src/screens/AppointmentsScreen';
import AppointmentDetailScreen from './src/screens/AppointmentDetailScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import ChooseCityScreen from './src/screens/ChooseCityScreen';
import HospitalSelectionScreen from './src/screens/HospitalSelectionScreen';
import DoctorSelectionScreen from './src/screens/DoctorSelectionScreen';
import BookingScreen from './src/screens/BookingScreen';
import BrandHeader, { NotificationBell } from './src/components/BrandHeader';
import { colors } from './src/theme';
import { patientApi } from './src/services/patientApi';
import { connectSocket } from './src/services/socketService';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function PatientTabs({ unreadNotificationCount }) {
  return (
    <Tab.Navigator
      screenOptions={({ navigation }) => ({
        headerShown: true,
        headerTitle: () => <BrandHeader />,
        headerRight: () => (
          <NotificationBell
            unreadCount={unreadNotificationCount}
            onPress={() => navigation.getParent()?.navigate('Notifications')}
          />
        ),
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleAlign: 'left',
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.brandDark,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingTop: 4,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
      })}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="AppointmentsTab"
        component={AppointmentsScreen}
        options={{
          title: 'My Appointments',
          tabBarLabel: 'Appointments',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="BookTab"
        component={ChooseCityScreen}
        options={{
          title: 'Book Appointment',
          tabBarLabel: 'Book Appointment',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'add-circle' : 'add-circle-outline'}
              size={25}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { user, isLoading, sessionError, loadSession } = useAuth();
  const [unreadNotificationCount, setUnreadNotificationCount] = React.useState(0);
  const notificationRequest = React.useRef(0);

  const refreshUnreadNotificationCount = React.useCallback(async (isActive = () => true) => {
    const requestId = ++notificationRequest.current;
    try {
      const response = await patientApi.getUnreadNotifications(100);
      if (isActive() && requestId === notificationRequest.current) {
        setUnreadNotificationCount(
          response.data.data?.count ?? response.data.data?.notifications?.length ?? 0
        );
      }
    } catch (error) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('Unread notification count error:', error?.message || error);
      }
    }
  }, []);

  React.useEffect(() => {
    if (!user) {
      notificationRequest.current += 1;
      setUnreadNotificationCount(0);
      return undefined;
    }

    let active = true;
    let socket;
    const updateUnreadCount = () => refreshUnreadNotificationCount(() => active);
    updateUnreadCount();

    connectSocket()
      .then((connectedSocket) => {
        if (!active || !connectedSocket) return;
        socket = connectedSocket;
        socket.on('newNotification', updateUnreadCount);
      })
      .catch((error) => {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn('Unable to connect to notification updates:', error?.message || error);
        }
      });

    return () => {
      active = false;
      notificationRequest.current += 1;
      socket?.off('newNotification', updateUnreadCount);
    };
  }, [refreshUnreadNotificationCount, user?._id]);

  if (isLoading) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.brandLight }}
        edges={['top', 'right', 'bottom', 'left']}
      >
        <LoadingScreen />
      </SafeAreaView>
    );
  }

  if (sessionError) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.brandLight }}
        edges={['top', 'right', 'bottom', 'left']}
      >
        <LoadingScreen error={sessionError} onRetry={loadSession} />
      </SafeAreaView>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={({ navigation, route }) => ({
          headerShown: true,
          headerTitle: () => <BrandHeader />,
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleAlign: 'left',
          headerRight:
            route.name === 'Notifications'
              ? undefined
              : () => (
                  <NotificationBell
                    unreadCount={unreadNotificationCount}
                    onPress={() => navigation.navigate('Notifications')}
                  />
                ),
        })}
      >
        {user ? (
          <>
            <Stack.Screen name="PatientTabs" options={{ headerShown: false }}>
              {(props) => (
                <PatientTabs
                  {...props}
                  unreadNotificationCount={unreadNotificationCount}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="Hospitals" component={HospitalSelectionScreen} />
            <Stack.Screen name="Doctors" component={DoctorSelectionScreen} />
            <Stack.Screen name="Booking" component={BookingScreen} />
            <Stack.Screen name="AppointmentDetail" component={AppointmentDetailScreen} />
            <Stack.Screen name="Notifications">
              {(props) => (
                <NotificationsScreen
                  {...props}
                  refreshUnreadCount={refreshUnreadNotificationCount}
                />
              )}
            </Stack.Screen>
          </>
        ) : (
          <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <StatusBar style="dark" backgroundColor={colors.surface} />
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
