from django.http import HttpResponse
from django.shortcuts import render,redirect
from django.db.models import Q
from django.contrib import messages
from .models import Room,Topic,Message,User
from .form import RoomForm, UserForm,MyUserCreationForm
from django.contrib.auth import authenticate,login,logout
from django.contrib.auth.decorators import login_required



# Create your views here.
 

def loginPage(request):
    page='login'
    if request.method=='POST':
        email=request.POST.get('email').lower()
        password=request.POST.get('password')
        
        try:
            user=User.objects.get(email=email)
        except:
            messages.error(request, "username  not exist")
        
        user=authenticate(request, email=email, password=password)
        
        if user is not None:
            login(request, user)
            return redirect('home')
        else:
            messages.error(request, "username or password does not exist")
        
    context={"page":page}
    return render(request, 'login_register.html',context)
def logoutUser(request):
    logout(request)
    return redirect('home')
def registerPage(request):
    form=MyUserCreationForm()
    if request.method=='POST':
        form=MyUserCreationForm(request.POST)
        if form.is_valid():
            user=form.save(commit=False)
            user.username=user.username.lower()
            user.save()
            login(request, user)
            return redirect('home')
        else:
            messages.error(request, "An error occurred during registration")
    context={"form":form}
    return render(request, 'login_register.html',context)

def home(request):
    
    q=request.GET.get('q') if request.GET.get('q') != None  else ''
    rooms=Room.objects.filter(Q(topic__name__icontains=q)|
                              Q(name__icontains=q)|
                              Q(description__icontains=q)|
                              Q(host__username__icontains=q))
    
    room_messages=Message.objects.filter(Q(room__topic__name__icontains=q)).order_by('-created')[:3]

    room_count=rooms.count()
    topics=Topic.objects.all()[0:5]
    context={'rooms':rooms,
             'topics':topics,
              'room_count':room_count,"room_messages":room_messages}
    # home_old.html
    return render(request, 'home.html',context)

def profile(request, pk):
    user=User.objects.get(id=pk)
    room_messages=user.message_set.all()
    rooms=user.room_set.all()
    topics=Topic.objects.all()
    context={'user':user,'rooms':rooms,'topics':topics, "room_messages":room_messages}
    return render(request, 'profile.html', context)
def room(request,pk):
    room=Room.objects.get(id=pk)
    room_messages=room.message_set.all().order_by('-created')
    participants=room.participants.all()
    
    if request.user.is_authenticated:
        room.participants.add(request.user)
    if request.method=='POST':
        message=Message.objects.create(
            user=request.user,
            room=room,
            body=request.POST.get('body')
        )
        return redirect('room', pk=room.id)
    context={'room':room, 'room_messages':room_messages,"participants":participants}
    return render(request, 'room.html',context)



def createroom(request):
    
    form=RoomForm()
    topics=Topic.objects.all()

    if request.method=='POST':
        topic_name=request.POST.get('topic_drop')
        topic, created=Topic.objects.get_or_create(name=topic_name)
        Room.objects.create(
            host=request.user,
            topic=topic,
            name=request.POST.get('name'),
            description=request.POST.get('description'),
        )
        return redirect('home')

    context={"form":form,"topics":topics}
    return render(request, 'room_form.html',context)


def updateroom(request,pk):
    room=Room.objects.get(id=pk)
    form=RoomForm(instance=room)
    topics=Topic.objects.all()

    if request.method=='POST':
       topic_name=request.POST.get('topic_drop')
       topic, created=Topic.objects.get_or_create(name=topic_name)
       room.topic=topic
       room.name=request.POST.get('name')
       room.description=request.POST.get('description')
       room.save()
       return redirect('home')
        
    context={'form':form,"topics":topics,"room":room}
    return render(request, 'room_form.html',context)

@login_required(login_url='login')
def deleteroom(request,pk):
    room=Room.objects.get(id=pk)
    if request.method=='POST':
        room.delete()
        return redirect('home')
    return render(request,'delete.html',{'obj':room})


@login_required(login_url='login')
def deletemessage(request,pk):
    message=Message.objects.get(id=pk)
    if request.method=='POST':
        message.delete()
        return redirect('home')
    return render(request,'delete.html',{'obj':message})

@login_required(login_url='login')
def updateuser(request):
    user=request.user
    form=UserForm(instance=user)
    if request.method=='POST':
        form=UserForm(request.POST, request.FILES,instance=user)
        if form.is_valid():
            form.save()
            return redirect('profile', pk=user.id)
    context={'form':form}
    return render(request, 'update_user.html', context)
def topicsPage(request):
    q=request.GET.get('q') if request.GET.get('q') != None  else ''
    topics=Topic.objects.filter(name__icontains=q)
    context={'topics':topics}
    return render(request, 'topics.html',context)

def activityPage(request):
    room_messages=Message.objects.all()
    context={'room_messages':room_messages}
    return render(request, 'activity.html',context)