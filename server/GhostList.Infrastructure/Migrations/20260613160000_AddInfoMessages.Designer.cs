using System;
using GhostList.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace GhostList.Infrastructure.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260613160000_AddInfoMessages")]
    partial class AddInfoMessages
    {
        protected override void BuildTargetModel(ModelBuilder modelBuilder)
        {
#pragma warning disable 612, 618
            modelBuilder
                .HasAnnotation("ProductVersion", "10.0.8")
                .HasAnnotation("Relational:MaxIdentifierLength", 63);

            NpgsqlModelBuilderExtensions.UseIdentityByDefaultColumns(modelBuilder);

            modelBuilder.Entity("GhostList.Domain.Entities.DailyUsageStat", b =>
                {
                    b.Property<DateOnly>("Date")
                        .HasColumnType("date");

                    b.Property<int>("ItemsCreated")
                        .HasColumnType("integer");

                    b.Property<int>("ListsCreated")
                        .HasColumnType("integer");

                    b.Property<int>("MembersCreated")
                        .HasColumnType("integer");

                    b.Property<int>("MessagesCreated")
                        .HasColumnType("integer");

                    b.HasKey("Date");

                    b.ToTable("DailyUsageStats");
                });

            modelBuilder.Entity("GhostList.Domain.Entities.GhostChatMessage", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTime>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("EncryptedMessage")
                        .IsRequired()
                        .HasColumnType("text");

                    b.Property<string>("EncryptedSenderName")
                        .IsRequired()
                        .HasColumnType("text");

                    b.Property<Guid>("GhostListId")
                        .HasColumnType("uuid");

                    b.Property<string>("InitializationVector")
                        .IsRequired()
                        .HasColumnType("text");

                    b.Property<Guid?>("ReplyToMessageId")
                        .HasColumnType("uuid");

                    b.Property<string>("SenderDeviceId")
                        .HasMaxLength(64)
                        .HasColumnType("character varying(64)");

                    b.Property<string>("SenderNameInitializationVector")
                        .IsRequired()
                        .HasColumnType("text");

                    b.HasKey("Id");

                    b.HasIndex("GhostListId");

                    b.ToTable("GhostChatMessages");
                });

            modelBuilder.Entity("GhostList.Domain.Entities.GhostList", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<int>("CompletedItemsTtl")
                        .HasColumnType("integer");

                    b.Property<DateTime>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("OwnerTokenHash")
                        .HasMaxLength(64)
                        .HasColumnType("character varying(64)");

                    b.HasKey("Id");

                    b.ToTable("GhostLists");
                });

            modelBuilder.Entity("GhostList.Domain.Entities.GhostListItem", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTime?>("CheckedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTime>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("EncryptedPayload")
                        .IsRequired()
                        .HasColumnType("text");

                    b.Property<Guid>("GhostListId")
                        .HasColumnType("uuid");

                    b.Property<string>("InitializationVector")
                        .IsRequired()
                        .HasColumnType("text");

                    b.Property<bool>("IsChecked")
                        .HasColumnType("boolean");

                    b.Property<string>("SenderDeviceId")
                        .HasMaxLength(64)
                        .HasColumnType("character varying(64)");

                    b.HasKey("Id");

                    b.HasIndex("GhostListId");

                    b.ToTable("GhostListItems");
                });

            modelBuilder.Entity("GhostList.Domain.Entities.GhostMessageImage", b =>
                {
                    b.Property<Guid>("Id")
                        .HasColumnType("uuid");

                    b.Property<DateTime>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("EncryptedImage")
                        .IsRequired()
                        .HasColumnType("text");

                    b.Property<Guid>("GhostListId")
                        .HasColumnType("uuid");

                    b.Property<string>("ImageInitializationVector")
                        .IsRequired()
                        .HasColumnType("text");

                    b.HasKey("Id");

                    b.ToTable("GhostMessageImages");
                });

            modelBuilder.Entity("GhostList.Domain.Entities.InfoMessage", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<string>("Body")
                        .IsRequired()
                        .HasMaxLength(4000)
                        .HasColumnType("character varying(4000)");

                    b.Property<DateTime>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("Title")
                        .IsRequired()
                        .HasMaxLength(200)
                        .HasColumnType("character varying(200)");

                    b.Property<int>("Type")
                        .HasColumnType("integer");

                    b.HasKey("Id");

                    b.HasIndex("CreatedAt");

                    b.ToTable("InfoMessages");
                });

            modelBuilder.Entity("GhostList.Domain.Entities.GhostChatMessage", b =>
                {
                    b.HasOne("GhostList.Domain.Entities.GhostList", null)
                        .WithMany("ChatMessages")
                        .HasForeignKey("GhostListId")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();
                });

            modelBuilder.Entity("GhostList.Domain.Entities.GhostListItem", b =>
                {
                    b.HasOne("GhostList.Domain.Entities.GhostList", null)
                        .WithMany("Items")
                        .HasForeignKey("GhostListId")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();
                });

            modelBuilder.Entity("GhostList.Domain.Entities.GhostMessageImage", b =>
                {
                    b.HasOne("GhostList.Domain.Entities.GhostChatMessage", null)
                        .WithOne()
                        .HasForeignKey("GhostList.Domain.Entities.GhostMessageImage", "Id")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();
                });

            modelBuilder.Entity("GhostList.Domain.Entities.DeviceSubscription", b =>
                {
                    b.Property<string>("DeviceId")
                        .HasMaxLength(64)
                        .HasColumnType("character varying(64)");

                    b.Property<Guid>("ListId")
                        .HasColumnType("uuid");

                    b.Property<string>("DeviceToken")
                        .IsRequired()
                        .HasMaxLength(512)
                        .HasColumnType("character varying(512)");

                    b.Property<bool>("NotifyOnItemsChanged")
                        .HasColumnType("boolean");

                    b.Property<bool>("NotifyOnMessage")
                        .HasColumnType("boolean");

                    b.Property<int>("Platform")
                        .HasColumnType("integer");

                    b.Property<DateTime>("RegisteredAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset>("UpdatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.HasKey("DeviceId", "ListId");

                    b.HasIndex("DeviceToken");

                    b.HasIndex("ListId");

                    b.ToTable("DeviceSubscriptions");

                    b.HasOne("GhostList.Domain.Entities.GhostList", null)
                        .WithMany()
                        .HasForeignKey("ListId")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();
                });

            modelBuilder.Entity("GhostList.Domain.Entities.GhostListMember", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<string>("DeviceId")
                        .IsRequired()
                        .HasMaxLength(64)
                        .HasColumnType("character varying(64)");

                    b.Property<string>("EncryptedPayload")
                        .IsRequired()
                        .HasColumnType("text");

                    b.Property<Guid>("GhostListId")
                        .HasColumnType("uuid");

                    b.Property<string>("InitializationVector")
                        .IsRequired()
                        .HasColumnType("text");

                    b.Property<DateTimeOffset?>("LastReadItemAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset?>("LastReadMessageAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset>("UpdatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.HasKey("Id");

                    b.HasIndex("GhostListId", "DeviceId")
                        .IsUnique();

                    b.ToTable("GhostListMembers");

                    b.HasOne("GhostList.Domain.Entities.GhostList", null)
                        .WithMany()
                        .HasForeignKey("GhostListId")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();
                });

            modelBuilder.Entity("GhostList.Domain.Entities.GhostList", b =>
                {
                    b.Navigation("ChatMessages");
                    b.Navigation("Items");
                });
#pragma warning restore 612, 618
        }
    }
}
